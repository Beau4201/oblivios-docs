// The nine parts of the system, the decisions behind each (a grouping made for the pages, not a record) and the text of
// each part. Counts per part are read from the decision log in records.mjs. The text is the owner's voice (I).
import { parts } from "@oblivios/site-shared/lib/parts.mjs";
import { counts } from "./records.mjs";

const define = (a) => ({ ...a, ...counts(a.adrs) });

// the print and the description of the print of each part; the group of decisions is shared with oblivios.dev
const art = {
  compartments: { p: "p7", alt: "Four cells with a different shape in each" },
  "network-exit": { p: "p5", alt: "Concentric rings, layer inside layer" },
  "live-data-map": { p: "p3", alt: "A cell tower sending signals" },
  "duress-unlock": { p: "p2", alt: "Two phones, one behind the other" },
  passwords: { p: "p1", alt: "A padlock" },
  "grab-detection": { p: "p8", alt: "A phone pulled away, with a lock" },
  "app-drawer": { p: "p9", alt: "A grid of apps in a frame" },
  keyboard: { p: "p4", alt: "A keyboard" },
  airpods: { p: "p6", alt: "A pair of earbuds" },
};
export const areas = parts.map((part) => define({ ...part, ...art[part.id] }));

// paragraphs (html, trusted) and the line of what the part does not claim (or null)
export const text = {
  compartments: {
    paras: [
      "Each app gets its own compartment of device identity, so apps cannot recognise the phone or link to one another. That is the whole promise. It is not invisibility (ADR-180).",
      "For each app you choose how its device identity looks: <b>Identified</b>, <b>Unlinked</b> (the default) or <b>Substituted</b>. Unlinked closes the channels apps use to tell phones apart, such as unit properties that any app could read and the calibration values of the motion sensors (ADR-167). Substituted gives the app one persona: a place, the time zone of that place, a network exit in that country, and matching answers for sensors, cell identity and Wi-Fi and Bluetooth scans. Emergency location stays real (ADR-208).",
    ],
    no: "The network address, the phone model, the installed apps and what you type stay visible to an app, and the page for each app lists what stays visible. An app given a place in another country can still be noticed through magnetic field, air pressure, SIM country and cell detail (ADR-208, ADR-209).",
  },
  "network-exit": {
    paras: [
      "Choose per app how its traffic leaves the phone: <b>Direct</b>, which is the default, through <b>Tor</b>, or through <b>your own WireGuard profile</b>. Tor uses one circuit family per app, from a Rust exit service built on Arti. An app set to an exit has no network while the exit is down, and the message names Tor as the likely cause (ADR-178).",
      "Tor is not the default because it was measured: ten megabytes took 6.6 to 89 times as long as Direct, and a request started 11 to 18 times later. I run and pay for no relay. Masked destinations send only listed third-party hosts through Tor (ADR-181).",
    ],
    no: "Tor is slower than Direct, and sites that block the public exit list fail on it. Apps that need UDP fail on Tor until you switch them to Direct. An own profile trusts the server or provider you picked (ADR-178).",
  },
  "live-data-map": {
    paras: [
      "A map and a list of the companies and places your apps talk to. A classifier names the company behind a server, and a place database puts servers and cell towers on the map (ADR-157, ADR-158, ADR-161). Both are separate data files with their own licences: the classifier and the cell data are CC BY-SA 4.0, the place data CC BY 4.0.",
      "A row in Settings exports what the map shows to one file, only when you ask and in a place you choose (ADR-189).",
    ],
    no: "The file that turns IP addresses into places is not in the repositories. The bill of materials lists its sources.",
  },
  "duress-unlock": {
    paras: [
      "A second, separate credential opens a decoy profile instead of yours. The real profile is stopped and never shown (threat model). One enrolled finger can be chosen in Settings as that credential (ADR-217, still proposed). GrapheneOS's own duress PIN, which wipes the phone, is kept (ADR-038).",
      "The decoy has to equal the ordinary unlock in time and in every animation, with a margin of zero. That requirement is written down and the measuring is still open (ADR-228, still only proposed).",
    ],
    no: "A sufficiently informed adversary who already suspects ObliviOS has this feature could demand proof that the shown profile is the only one, or examine the OS image offline for the code path. Timing differences between a wrong PIN, a decoy PIN and the real PIN are a residual risk. Publishing the source also tells such an adversary that the feature exists (threat model, ADR-171).",
  },
  passwords: {
    paras: [
      "The default password manager and autofill provider. It is local only: no sync, no server, no account and no network permission. The only way out is one encrypted export file under its own passphrase. The only way in on a new phone is an import, including CSV files from other managers (ADR-190).",
      "Unlock uses the system biometric prompt with a passphrase as fallback. Logins appear as chips in the keyboard's suggestion strip and never open a window (ADR-191, still proposed). A website name is accepted only from Vanadium and from browsers you trust (ADR-193).",
    ],
    no: null,
  },
  "grab-detection": {
    paras: [
      "If the phone is pulled out of your hand while it is unlocked, it locks at once, shows one line above the PIN entry and vibrates. A hard impact locks it too, unless it follows a short free fall, which counts as a set-down (ADR-176, ADR-195, ADR-204). The GrapheneOS auto-reboot timer is armed for 60 seconds, and a PIN unlock cancels it. The behaviour is the same in the decoy session, and nothing happens during a call (ADR-169).",
      "It ships in a shadow mode that only logs. One row in Settings, Lock when grabbed, sets it to Off, Strictest, Standard or Relaxed (ADR-169, ADR-197, ADR-198).",
    ],
    no: "The thresholds are not tuned on daily use yet, so it can lock when you did not mean it, or miss a pull. A pull while a finger still touches the screen at the peak is not read as a pull (ADR-169, ADR-176).",
  },
  "app-drawer": {
    paras: ["The app drawer takes over the home screen's themed icons (ADR-141) and gets a System group that holds every preinstalled app (ADR-142)."],
    no: null,
  },
  keyboard: {
    paras: ["The on-screen keyboard (LatinIME) gets a new look and a landscape fix (ADR-146). Its suggestion strip carries the logins of the Passwords app as chips (ADR-191)."],
    no: null,
  },
  airpods: {
    paras: [
      "Settings gets an AirPods page with every control the AirPods expose (ADR-132). The session speaks the real accessory protocol (ADR-124), and ear detection is done by the phone (ADR-125). With no pod in an ear the AirPods leave the active audio route (ADR-172, still proposed).",
      "<code>airpods-core</code> holds the protocol code and builds without an AOSP tree.",
    ],
    no: "Taking part in Apple's Find My network is refused as a hard non-goal. It stays refused unless I make a separate, written decision to change that (threat model).",
  },
};

export function adrRange(ids) {
  const s = [...ids].sort((a, b) => a - b);
  return s.slice(0, 8).map((i) => `ADR-${i}`).join(", ") + (s.length > 8 ? ` and ${s.length - 8} more` : "");
}
