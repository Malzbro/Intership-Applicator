import type { Sector } from "@/lib/sectors";

// UK engineering and technology employers worth pulling directly. Seeding these
// lets enrichment resolve each domain and detect its job board; once found, the
// board adapters pull that employer's complete live list as structured data.
// Their sector is known, so they skip model classification.
//
// A name here is a candidate, not a claim: nothing is written to jobs until
// the employer's own board or an API returns it.

type Seed = { name: string; domain?: string; sector: Sector };

const E = "engineering", T = "technology", I = "infrastructure", F = "finance_tech";

export const SEED_EMPLOYERS: Seed[] = [
  // aerospace, defence & space
  { name: "Airbus UK", domain: "airbus.com", sector: E },
  { name: "BAE Systems", domain: "baesystems.com", sector: E },
  { name: "MBDA", domain: "mbda-systems.com", sector: E },
  { name: "Rolls-Royce", domain: "rolls-royce.com", sector: E },
  { name: "Leonardo UK", domain: "leonardo.com", sector: E },
  { name: "Thales UK", domain: "thalesgroup.com", sector: E },
  { name: "Raytheon UK", domain: "raytheon.com", sector: E },
  { name: "QinetiQ", domain: "qinetiq.com", sector: E },
  { name: "GKN Aerospace", domain: "gknaerospace.com", sector: E },
  { name: "Boeing", domain: "boeing.com", sector: E },
  { name: "Reaction Engines", domain: "reactionengines.co.uk", sector: E },
  { name: "Surrey Satellite Technology", domain: "sstl.co.uk", sector: E },
  { name: "Oxford Space Systems", domain: "oxford.space", sector: E },
  { name: "Skyrora", domain: "skyrora.com", sector: E },

  // automotive & motorsport
  { name: "JLR", domain: "jaguarlandrover.com", sector: E },
  { name: "McLaren", domain: "mclaren.com", sector: E },
  { name: "Aston Martin", domain: "astonmartin.com", sector: E },
  { name: "Bentley Motors", domain: "bentleymotors.com", sector: E },
  { name: "Nissan UK", domain: "nissan.co.uk", sector: E },
  { name: "Mercedes-AMG High Performance Powertrains", domain: "mercedes-amg-hpp.com", sector: E },
  { name: "Alpine Racing", domain: "alpinecars.co.uk", sector: E },
  { name: "Williams Racing", domain: "williamsf1.com", sector: E },
  { name: "Red Bull Powertrains", domain: "redbullracing.com", sector: E },
  { name: "Cosworth", domain: "cosworth.com", sector: E },
  { name: "Ricardo", domain: "ricardo.com", sector: E },
  { name: "Triumph Motorcycles", domain: "triumphmotorcycles.co.uk", sector: E },

  // semiconductors & electronics
  { name: "Arm", domain: "arm.com", sector: T },
  { name: "Imagination Technologies", domain: "imaginationtech.com", sector: T },
  { name: "Graphcore", domain: "graphcore.ai", sector: T },
  { name: "Nordic Semiconductor", domain: "nordicsemi.com", sector: E },
  { name: "Renesas", domain: "renesas.com", sector: E },
  { name: "Infineon", domain: "infineon.com", sector: E },
  { name: "Analog Devices", domain: "analog.com", sector: E },
  { name: "Texas Instruments", domain: "ti.com", sector: E },
  { name: "Nexperia", domain: "nexperia.com", sector: E },
  { name: "XMOS", domain: "xmos.com", sector: E },
  { name: "Cirrus Logic", domain: "cirrus.com", sector: E },

  // instruments, industrial & robotics
  { name: "Renishaw", domain: "renishaw.com", sector: E },
  { name: "Dyson", domain: "dyson.com", sector: E },
  { name: "Siemens UK", domain: "siemens.com", sector: E },
  { name: "ABB UK", domain: "abb.com", sector: E },
  { name: "Schneider Electric UK", domain: "se.com", sector: E },
  { name: "Eaton", domain: "eaton.com", sector: E },
  { name: "Oxford Instruments", domain: "oxinst.com", sector: E },
  { name: "Spectris", domain: "spectris.com", sector: E },
  { name: "Ocado Technology", domain: "ocadogroup.com", sector: T },
  { name: "Cambridge Consultants", domain: "cambridgeconsultants.com", sector: E },
  { name: "TTP", domain: "ttp.com", sector: E },
  { name: "PA Consulting", domain: "paconsulting.com", sector: E },

  // energy technology
  { name: "Tokamak Energy", domain: "tokamakenergy.com", sector: E },
  { name: "First Light Fusion", domain: "firstlightfusion.com", sector: E },
  { name: "UK Atomic Energy Authority", sector: E },
  { name: "Ceres Power", domain: "cerespower.com", sector: E },
  { name: "ITM Power", domain: "itm-power.com", sector: E },
  { name: "Octopus Energy", domain: "octopus.energy", sector: T },

  // grid, utilities & infrastructure
  { name: "National Grid", domain: "nationalgrid.com", sector: I },
  { name: "SSE", domain: "sse.com", sector: I },
  { name: "EDF Energy", domain: "edfenergy.com", sector: I },
  { name: "Network Rail", domain: "networkrail.co.uk", sector: I },
  { name: "Siemens Mobility UK", domain: "mobility.siemens.com", sector: E },
  { name: "Alstom UK", domain: "alstom.com", sector: E },
  { name: "Arup", domain: "arup.com", sector: I },
  { name: "Atkins", domain: "atkinsrealis.com", sector: I },
  { name: "Mott MacDonald", domain: "mottmac.com", sector: I },

  // tech & AI
  { name: "Google DeepMind", domain: "deepmind.google", sector: T },
  { name: "Wayve", domain: "wayve.ai", sector: T },
  { name: "Scale AI", domain: "scale.com", sector: T },
  { name: "BT Group", domain: "bt.com", sector: T },
  { name: "Vodafone UK", domain: "vodafone.co.uk", sector: T },

  // finance tech
  { name: "Jane Street", domain: "janestreet.com", sector: F },
  { name: "Citadel Securities", domain: "citadelsecurities.com", sector: F },
];
