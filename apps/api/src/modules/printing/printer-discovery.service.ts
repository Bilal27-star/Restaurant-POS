import net from "node:net";
import os from "node:os";

const RAW_PRINT_PORT = 9100;
const CONNECT_TIMEOUT_MS = 500;
const SCAN_CONCURRENCY = 64;

export type DiscoveredPrinter = {
  name: string;
  host: string;
  port: number;
  status: "online";
};

type Subnet = {
  address: string;
  netmask: string;
};

export class PrinterDiscoveryService {
  async discoverPrinters(): Promise<DiscoveredPrinter[]> {
    const subnets = getLocalSubnets();
    if (subnets.length === 0) {
      return [];
    }

    const hosts = [...new Set(subnets.flatMap((subnet) => enumerateHosts(subnet)))];
    const onlineHosts = await scanHostsForPort(hosts, RAW_PRINT_PORT);

    return onlineHosts.map((host) => {
      const printer: DiscoveredPrinter = {
        name: "Unknown Printer",
        host,
        port: RAW_PRINT_PORT,
        status: "online",
      };
      console.info("[PRINTER DISCOVERED]", printer);
      return printer;
    });
  }
}

function getLocalSubnets(): Subnet[] {
  const interfaces = os.networkInterfaces();
  const subnets: Subnet[] = [];

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      subnets.push({ address: entry.address, netmask: entry.netmask });
    }
  }

  return subnets;
}

function enumerateHosts(subnet: Subnet): string[] {
  const ip = ipv4ToInt(subnet.address);
  const mask = ipv4ToInt(subnet.netmask);
  const network = ip & mask;
  const broadcast = network | ~mask;
  const hosts: string[] = [];

  for (let host = network + 1; host < broadcast; host++) {
    if (host === ip) continue;
    hosts.push(intToIpv4(host));
  }

  return hosts;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function intToIpv4(value: number): string {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join(".");
}

async function scanHostsForPort(hosts: string[], port: number): Promise<string[]> {
  const online: string[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < hosts.length) {
      const host = hosts[index++]!;
      if (await isPortOpen(host, port, CONNECT_TIMEOUT_MS)) {
        online.push(host);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(SCAN_CONCURRENCY, hosts.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return online.sort((a, b) => ipv4ToInt(a) - ipv4ToInt(b));
}

function isPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });

    const fail = () => {
      socket.destroy();
      resolve(false);
    };

    socket.once("error", fail);
    socket.once("timeout", fail);
  });
}
