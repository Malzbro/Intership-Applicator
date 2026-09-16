// UK engineering employers worth pulling directly. Seeding these lets
// enrichment resolve each domain and detect its ATS; once an ATS is found the
// Greenhouse/Lever/Ashby/Workable adapters pull that employer's complete live
// board as structured JSON — strictly better than scraping an aggregator's
// index of the same postings.
//
// A name here is a candidate, not a claim: nothing is written to jobs until
// the employer's own board or an API returns it.

export const SEED_EMPLOYERS: { name: string; domain?: string }[] = [
  // aerospace & defence
  { name: "MBDA", domain: "mbda-systems.com" },
  { name: "BAE Systems", domain: "baesystems.com" },
  { name: "Leonardo UK", domain: "leonardo.com" },
  { name: "Thales UK", domain: "thalesgroup.com" },
  { name: "Rolls-Royce", domain: "rolls-royce.com" },
  { name: "Airbus UK", domain: "airbus.com" },
  { name: "Raytheon UK", domain: "raytheon.com" },
  { name: "QinetiQ", domain: "qinetiq.com" },
  { name: "Reaction Engines", domain: "reactionengines.co.uk" },
  { name: "Oxford Space Systems", domain: "oxford.space" },

  // semiconductors & electronics
  { name: "Arm", domain: "arm.com" },
  { name: "Imagination Technologies", domain: "imaginationtech.com" },
  { name: "Nordic Semiconductor", domain: "nordicsemi.com" },
  { name: "Renesas", domain: "renesas.com" },
  { name: "Infineon", domain: "infineon.com" },
  { name: "Analog Devices", domain: "analog.com" },
  { name: "Texas Instruments", domain: "ti.com" },
  { name: "Nexperia", domain: "nexperia.com" },
  { name: "Graphcore", domain: "graphcore.ai" },
  { name: "XMOS", domain: "xmos.com" },

  // instruments, metrology, industrial
  { name: "Renishaw", domain: "renishaw.com" },
  { name: "Dyson", domain: "dyson.com" },
  { name: "Siemens UK", domain: "siemens.com" },
  { name: "ABB UK", domain: "abb.com" },
  { name: "Schneider Electric UK", domain: "se.com" },
  { name: "Eaton", domain: "eaton.com" },
  { name: "Emerson", domain: "emerson.com" },
  { name: "Honeywell UK", domain: "honeywell.com" },
  { name: "Oxford Instruments", domain: "oxinst.com" },
  { name: "Spectris", domain: "spectris.com" },

  // energy, power & grid
  { name: "National Grid", domain: "nationalgrid.com" },
  { name: "SSE", domain: "sse.com" },
  { name: "EDF Energy", domain: "edfenergy.com" },
  { name: "Octopus Energy", domain: "octopus.energy" },
  { name: "Orsted UK", domain: "orsted.co.uk" },
  { name: "Tokamak Energy", domain: "tokamakenergy.com" },
  { name: "First Light Fusion", domain: "firstlightfusion.com" },
  { name: "Ceres Power", domain: "cerespower.com" },
  { name: "ITM Power", domain: "itm-power.com" },

  // automotive & EV
  { name: "JLR", domain: "jaguarlandrover.com" },
  { name: "McLaren", domain: "mclaren.com" },
  { name: "Aston Martin", domain: "astonmartin.com" },
  { name: "Mercedes-AMG High Performance Powertrains", domain: "mercedes-amg-hpp.com" },
  { name: "Alpine Racing", domain: "alpinecars.co.uk" },
  { name: "Williams Racing", domain: "williamsf1.com" },
  { name: "Cosworth", domain: "cosworth.com" },
  { name: "Delta Cosworth", domain: "deltacosworth.com" },
  { name: "Arrival", domain: "arrival.com" },
  { name: "Wayve", domain: "wayve.ai" },

  // rail & infrastructure
  { name: "Network Rail", domain: "networkrail.co.uk" },
  { name: "Siemens Mobility UK", domain: "mobility.siemens.com" },
  { name: "Alstom UK", domain: "alstom.com" },
  { name: "Atkins", domain: "atkinsrealis.com" },
  { name: "Arup", domain: "arup.com" },
  { name: "Mott MacDonald", domain: "mottmac.com" },

  // medical & scientific instruments
  { name: "GE HealthCare UK", domain: "gehealthcare.co.uk" },
  { name: "Smith+Nephew", domain: "smith-nephew.com" },
  { name: "PA Consulting", domain: "paconsulting.com" },
  { name: "TTP", domain: "ttp.com" },
  { name: "Cambridge Consultants", domain: "cambridgeconsultants.com" },
  { name: "Dephy", domain: "dephy.com" },

  // telecoms & networks
  { name: "BT Group", domain: "bt.com" },
  { name: "Vodafone UK", domain: "vodafone.co.uk" },
  { name: "Viavi Solutions", domain: "viavisolutions.com" },
  { name: "Ofcom", domain: "ofcom.org.uk" },
];
