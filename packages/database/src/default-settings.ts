/**
 * Default `SystemSettings.settingsJson` shape (extend at app layer).
 * Receipt / printer / UI preferences merge here on first seed.
 */
export const defaultSystemSettingsJson = {
  v: 1 as const,
  receipt: {
    headerLines: ["Merci de votre visite"],
    footerLines: [] as string[],
    showTaxBreakdown: true,
  },
  printers: {
    defaultPaperWidthChars: 32,
  },
  ui: {
    density: "comfortable" as const,
    language: "fr",
  },
} as const;

export type DefaultSystemSettings = typeof defaultSystemSettingsJson;
