import { PlanSchema, type Intake, type Plan } from "./schema";
import cadence from "./samples/cadence-health.json";

/**
 * Cadence Health — a fictional teaching example (post-discharge heart-failure
 * monitoring: adhesive biosensor patch + app; Singapore home market, EU CE
 * marking, Germany and Spain), built on real regulatory sources. Used by the
 * "Load sample" button, by REGPATH_MOCK=1, and by the test suite.
 */
export function samplePlan(): Plan {
  return PlanSchema.parse(cadence);
}

export function sampleIntake(): Intake {
  return {
    companyName: "Cadence Health",
    productName: "Cadence Loop",
    productSummary:
      "A disposable adhesive biosensor patch paired with an app that flags likely early decompensation after a heart-failure hospital discharge and prompts care-team outreach. Pilots at Boston and Singapore hospitals; a pivotal readmission-reduction trial is being designed.",
    productCategory: "connected medical device with decision-support software",
    intendedUse: "Detect early signs of decompensation in recently discharged heart-failure patients and alert the care team",
    population: "Recently discharged, often elderly, heart-failure patients; caregivers; remote care teams",
    homeMarket: "Singapore",
    stage: "trial-planned",
    hardware: "bundled-custom-hardware",
    aiFeatures: "unknown",
    ipStatus: "unknown",
    euTargets: ["Germany", "Spain"],
    ambiguities: [
      "Whether the decompensation alert uses machine learning or deterministic thresholds (changes AI Act exposure)",
      "Whether the Class IIa vs IIb framing has been stress-tested — it decides DiGA eligibility",
      "Patent status of the alerting method",
    ],
    extraQuestions: [
      {
        id: "patch-contact-duration",
        question: "How long is the adhesive patch worn continuously?",
        options: ["Under 24 hours", "1–30 days", "Over 30 days", "Not decided"],
        multi: false,
      },
    ],
    deckDigest: "",
    inScope: true,
    scopeNote: "",
  };
}
