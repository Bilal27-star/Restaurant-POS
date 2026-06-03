import type { KitchenStation } from "@pos/database";

import { resolveKitchenStation } from "../menu/kitchen-station.js";
import type {
  KitchenDeltaLine,
  KitchenDeltaSection,
  KitchenDetectLine,
  KitchenDispatchIntent,
  KitchenRoutingValidationResult,
  KitchenStationBundle,
  UnroutedLine,
} from "./kitchen-delta.types.js";

/** Spec §11.1 — resolve station for a line at preflight. */
export function resolveLineKitchenStation(line: KitchenDetectLine): KitchenStation | null {
  if (line.kitchenStation) {
    return line.kitchenStation;
  }
  if (line.menuItemKitchenStation) {
    return line.menuItemKitchenStation;
  }
  return resolveKitchenStation(line.menuCategoryName, line.nameSnapshot);
}

function bundleHasSections(bundle: KitchenStationBundle): boolean {
  return bundle.sections.some((s) => s.lines.length > 0 || (s.infoText && s.infoText.length > 0));
}

function groupSectionsIntoBundles(
  sections: Array<{ station: KitchenStation; section: KitchenDeltaSection }>,
): KitchenStationBundle[] {
  const byStation = new Map<KitchenStation, KitchenDeltaSection[]>();
  for (const { station, section } of sections) {
    const list = byStation.get(station) ?? [];
    list.push(section);
    byStation.set(station, list);
  }
  return [...byStation.entries()].map(([station, stationSections]) => ({
    station,
    sections: stationSections,
  }));
}

/** Assign station to each delta line and group into station bundles. */
export function buildStationBundles(
  lineSections: Array<{
    line: KitchenDetectLine;
    section: Omit<KitchenDeltaSection, "lines"> & { lines?: KitchenDeltaLine[] };
  }>,
  infoSections: Array<{ station: KitchenStation; infoText: string }>,
): { bundles: KitchenStationBundle[]; unrouted: UnroutedLine[] } {
  const unrouted: UnroutedLine[] = [];
  const grouped: Array<{ station: KitchenStation; section: KitchenDeltaSection }> = [];

  for (const { line, section } of lineSections) {
    const station = resolveLineKitchenStation(line);
    if (!station) {
      unrouted.push({ orderItemId: line.id, nameSnapshot: line.nameSnapshot });
      continue;
    }
    grouped.push({
      station,
      section: {
        kind: section.kind,
        lines: section.lines ?? [],
        infoText: section.infoText,
      },
    });
  }

  for (const info of infoSections) {
    grouped.push({
      station: info.station,
      section: { kind: "INFO", lines: [], infoText: info.infoText },
    });
  }

  const bundles = groupSectionsIntoBundles(grouped).filter(bundleHasSections);
  return { bundles, unrouted };
}

/** Spec §11 — fail loud if any delta line is unrouted. */
export function validateKitchenDispatchRouting(intent: KitchenDispatchIntent): KitchenRoutingValidationResult {
  const unroutedLines: UnroutedLine[] = [];

  for (const bundle of intent.stationBundles) {
    for (const section of bundle.sections) {
      if (section.kind === "INFO") continue;
      for (const line of section.lines) {
        if (!line.kitchenStation && !bundle.station) {
          unroutedLines.push({ orderItemId: line.orderItemId, nameSnapshot: line.nameSnapshot });
        }
      }
    }
  }

  if (unroutedLines.length > 0) {
    return { ok: false, unroutedLines };
  }
  return { ok: true };
}

/** Re-validate after bundle assembly. */
export function validateBundlesAtPreflight(
  bundles: KitchenStationBundle[],
  unrouted: UnroutedLine[],
): KitchenRoutingValidationResult {
  if (unrouted.length > 0) {
    return { ok: false, unroutedLines: unrouted };
  }
  if (bundles.length === 0) {
    return { ok: true };
  }
  const extra: UnroutedLine[] = [];
  for (const bundle of bundles) {
    for (const section of bundle.sections) {
      if (section.kind === "INFO") continue;
      for (const line of section.lines) {
        if (!line.kitchenStation) {
          extra.push({ orderItemId: line.orderItemId, nameSnapshot: line.nameSnapshot });
        }
      }
    }
  }
  if (extra.length > 0) {
    return { ok: false, unroutedLines: extra };
  }
  return { ok: true };
}

export function attachStationToLines(bundles: KitchenStationBundle[]): KitchenStationBundle[] {
  return bundles.map((bundle) => ({
    station: bundle.station,
    sections: bundle.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        kitchenStation: line.kitchenStation ?? bundle.station,
      })),
    })),
  }));
}
