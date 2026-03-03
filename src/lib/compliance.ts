/**
 * Compliance Engine — Platform Regulation Enforcement
 *
 * Central compliance module for validating outreach messages across all channels.
 * Enforces rate limits, CAN-SPAM, TCPA, GDPR, and platform-specific rules.
 * Used before sending any outreach to ensure regulatory compliance.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface ComplianceCheckParams {
  channel: "email" | "linkedin" | "sms" | "whatsapp" | "call";
  leadId: string;
  messageBody: string;
  messageSubject?: string;
  userId: string;
  messagesToday?: number;
  messagesThisWeek?: number;
  messagesThisMonth?: number;
  connectionsToday?: number;
  connectionsThisWeek?: number;
  hasOptIn?: boolean;
  hasUnsubscribed?: boolean;
  gdprConsent?: boolean;
  hasUnsubscribeLink?: boolean;
  hasPhysicalAddress?: boolean;
  senderIdentified?: boolean;
  isPersonalized?: boolean;
}

export interface ComplianceCheckResult {
  passed: boolean;
  ruleId: string;
  ruleName: string;
  severity: "block" | "warn" | "info";
  message: string;
  suggestion?: string;
}

// ─── Rate Limits ──────────────────────────────────────────────────────

export const CHANNEL_RATE_LIMITS = {
  linkedin: {
    connectionsPerDay: 20,
    messagesPerDay: 50,
    connectionsPerWeek: 100,
    profileViewsPerDay: 80,
  },
  email: {
    messagesPerDay: 200,
    messagesPerHour: 50,
    newContactsPerDay: 100,
  },
  sms: {
    messagesPerDay: 50,
    messagesPerHour: 20,
  },
};

// ─── LinkedIn Compliance ──────────────────────────────────────────────

export function checkLinkedInCompliance(
  params: ComplianceCheckParams
): ComplianceCheckResult[] {
  const results: ComplianceCheckResult[] = [];
  const limits = CHANNEL_RATE_LIMITS.linkedin;

  // Rate limit: connections per day
  if ((params.connectionsToday ?? 0) >= limits.connectionsPerDay) {
    results.push({
      passed: false,
      ruleId: "linkedin_connections_day",
      ruleName: "LinkedIn Daily Connection Limit",
      severity: "block",
      message: `Daily connection limit reached (${params.connectionsToday}/${limits.connectionsPerDay}). Sending more risks account restriction.`,
      suggestion: "Wait until tomorrow to send more connection requests.",
    });
  }

  // Rate limit: messages per day
  if ((params.messagesToday ?? 0) >= limits.messagesPerDay) {
    results.push({
      passed: false,
      ruleId: "linkedin_messages_day",
      ruleName: "LinkedIn Daily Message Limit",
      severity: "block",
      message: `Daily message limit reached (${params.messagesToday}/${limits.messagesPerDay}). Sending more risks account restriction.`,
      suggestion: "Wait until tomorrow to send more messages.",
    });
  }

  // Rate limit: connections per week
  if ((params.connectionsThisWeek ?? 0) >= limits.connectionsPerWeek) {
    results.push({
      passed: false,
      ruleId: "linkedin_connections_week",
      ruleName: "LinkedIn Weekly Connection Limit",
      severity: "block",
      message: `Weekly connection limit reached (${params.connectionsThisWeek}/${limits.connectionsPerWeek}). Sending more risks account restriction.`,
      suggestion: "Wait until next week to send more connection requests.",
    });
  }

  // Personalization check: warn if body too short (likely template)
  if (params.messageBody.length < 50) {
    results.push({
      passed: true,
      ruleId: "linkedin_personalization",
      ruleName: "LinkedIn Personalization Check",
      severity: "warn",
      message: "Message body is under 50 characters. This may appear as a generic template and reduce acceptance rates.",
      suggestion: "Add personalization referencing the lead's role, company, or recent activity.",
    });
  }

  // Opt-out respected
  if (params.hasUnsubscribed) {
    results.push({
      passed: false,
      ruleId: "linkedin_opt_out",
      ruleName: "LinkedIn Opt-Out Respected",
      severity: "block",
      message: "This lead has opted out of communications. Sending messages violates their preference.",
      suggestion: "Remove this lead from outreach sequences.",
    });
  }

  // Approaching limits warnings
  if (
    (params.connectionsToday ?? 0) >= 15 &&
    (params.connectionsToday ?? 0) < limits.connectionsPerDay
  ) {
    results.push({
      passed: true,
      ruleId: "linkedin_connections_day_warn",
      ruleName: "LinkedIn Connection Limit Warning",
      severity: "warn",
      message: `Approaching daily connection limit (${params.connectionsToday}/${limits.connectionsPerDay}). Consider slowing down.`,
      suggestion: "Spread remaining connection requests throughout the day.",
    });
  }

  if (
    (params.messagesToday ?? 0) >= 40 &&
    (params.messagesToday ?? 0) < limits.messagesPerDay
  ) {
    results.push({
      passed: true,
      ruleId: "linkedin_messages_day_warn",
      ruleName: "LinkedIn Message Limit Warning",
      severity: "warn",
      message: `Approaching daily message limit (${params.messagesToday}/${limits.messagesPerDay}). Consider slowing down.`,
      suggestion: "Prioritize high-value leads for remaining messages today.",
    });
  }

  // If no issues found, add a passing result
  if (results.length === 0) {
    results.push({
      passed: true,
      ruleId: "linkedin_all_clear",
      ruleName: "LinkedIn Compliance",
      severity: "info",
      message: "All LinkedIn compliance checks passed.",
    });
  }

  return results;
}

// ─── Email Compliance (CAN-SPAM) ──────────────────────────────────────

export function checkEmailCompliance(
  params: ComplianceCheckParams
): ComplianceCheckResult[] {
  const results: ComplianceCheckResult[] = [];
  const limits = CHANNEL_RATE_LIMITS.email;

  // Rate limit: messages per day
  if ((params.messagesToday ?? 0) >= limits.messagesPerDay) {
    results.push({
      passed: false,
      ruleId: "email_messages_day",
      ruleName: "Email Daily Send Limit",
      severity: "block",
      message: `Daily email limit reached (${params.messagesToday}/${limits.messagesPerDay}). Sending more risks deliverability and sender reputation.`,
      suggestion: "Wait until tomorrow or use a different sending domain.",
    });
  }

  // CAN-SPAM: Unsubscribe link required
  if (!params.hasUnsubscribeLink) {
    results.push({
      passed: true,
      ruleId: "email_unsubscribe_link",
      ruleName: "CAN-SPAM Unsubscribe Link",
      severity: "warn",
      message: "Email does not include an unsubscribe link. CAN-SPAM requires a clear opt-out mechanism.",
      suggestion: "Add an unsubscribe link to the email footer.",
    });
  }

  // CAN-SPAM: Physical address required
  if (!params.hasPhysicalAddress) {
    results.push({
      passed: true,
      ruleId: "email_physical_address",
      ruleName: "CAN-SPAM Physical Address",
      severity: "warn",
      message: "Email does not include a physical mailing address. CAN-SPAM requires this in commercial emails.",
      suggestion: "Add your company's physical address to the email footer.",
    });
  }

  // CAN-SPAM: Sender identification
  if (!params.senderIdentified) {
    results.push({
      passed: true,
      ruleId: "email_sender_id",
      ruleName: "CAN-SPAM Sender Identification",
      severity: "warn",
      message: "Sender is not clearly identified. CAN-SPAM requires accurate sender information.",
      suggestion: "Ensure the 'From' name and email address clearly identify your company.",
    });
  }

  // Subject line check
  if (!params.messageSubject || params.messageSubject.length < 3) {
    results.push({
      passed: true,
      ruleId: "email_subject_line",
      ruleName: "Email Subject Line",
      severity: "warn",
      message: "Email subject line is missing or too short (under 3 characters). This may hurt open rates and deliverability.",
      suggestion: "Write a clear, relevant subject line that accurately represents the email content.",
    });
  }

  // Opt-out respected
  if (params.hasUnsubscribed) {
    results.push({
      passed: false,
      ruleId: "email_opt_out",
      ruleName: "CAN-SPAM Opt-Out Respected",
      severity: "block",
      message: "This lead has unsubscribed. CAN-SPAM requires honoring opt-out requests within 10 business days.",
      suggestion: "Remove this lead from all email outreach immediately.",
    });
  }

  // Approaching limit warning
  if (
    (params.messagesToday ?? 0) >= 180 &&
    (params.messagesToday ?? 0) < limits.messagesPerDay
  ) {
    results.push({
      passed: true,
      ruleId: "email_messages_day_warn",
      ruleName: "Email Send Limit Warning",
      severity: "warn",
      message: `Approaching daily email limit (${params.messagesToday}/${limits.messagesPerDay}). Consider slowing down to protect sender reputation.`,
      suggestion: "Prioritize high-value leads for remaining emails today.",
    });
  }

  // If no issues found, add a passing result
  if (results.length === 0) {
    results.push({
      passed: true,
      ruleId: "email_all_clear",
      ruleName: "Email Compliance",
      severity: "info",
      message: "All email compliance checks passed.",
    });
  }

  return results;
}

// ─── SMS Compliance (TCPA) ────────────────────────────────────────────

export function checkSmsCompliance(
  params: ComplianceCheckParams
): ComplianceCheckResult[] {
  const results: ComplianceCheckResult[] = [];
  const limits = CHANNEL_RATE_LIMITS.sms;

  // Rate limit: messages per day
  if ((params.messagesToday ?? 0) >= limits.messagesPerDay) {
    results.push({
      passed: false,
      ruleId: "sms_messages_day",
      ruleName: "SMS Daily Send Limit",
      severity: "block",
      message: `Daily SMS limit reached (${params.messagesToday}/${limits.messagesPerDay}). Sending more risks carrier filtering and TCPA violations.`,
      suggestion: "Wait until tomorrow to send more SMS messages.",
    });
  }

  // TCPA: Opt-in required
  if (!params.hasOptIn) {
    results.push({
      passed: false,
      ruleId: "sms_opt_in",
      ruleName: "TCPA Opt-In Required",
      severity: "block",
      message: "Lead has not opted in to receive SMS. TCPA requires prior express written consent for commercial text messages.",
      suggestion: "Obtain opt-in consent before sending SMS. Use email or LinkedIn to request SMS permission first.",
    });
  }

  // Opt-out respected
  if (params.hasUnsubscribed) {
    results.push({
      passed: false,
      ruleId: "sms_opt_out",
      ruleName: "TCPA Opt-Out Respected",
      severity: "block",
      message: "This lead has opted out of SMS. TCPA requires immediate compliance with opt-out requests.",
      suggestion: "Remove this lead from all SMS outreach immediately.",
    });
  }

  // Approaching limit warning
  if (
    (params.messagesToday ?? 0) >= 40 &&
    (params.messagesToday ?? 0) < limits.messagesPerDay
  ) {
    results.push({
      passed: true,
      ruleId: "sms_messages_day_warn",
      ruleName: "SMS Send Limit Warning",
      severity: "warn",
      message: `Approaching daily SMS limit (${params.messagesToday}/${limits.messagesPerDay}). Consider slowing down.`,
      suggestion: "Prioritize high-value leads for remaining SMS messages today.",
    });
  }

  // If no issues found, add a passing result
  if (results.length === 0) {
    results.push({
      passed: true,
      ruleId: "sms_all_clear",
      ruleName: "SMS Compliance",
      severity: "info",
      message: "All SMS compliance checks passed.",
    });
  }

  return results;
}

// ─── GDPR Compliance ──────────────────────────────────────────────────

export function checkGDPRCompliance(
  params: ComplianceCheckParams
): ComplianceCheckResult[] {
  const results: ComplianceCheckResult[] = [];

  // GDPR: Consent required for email
  if (!params.gdprConsent && params.channel === "email") {
    results.push({
      passed: true,
      ruleId: "gdpr_consent_email",
      ruleName: "GDPR Consent for Email",
      severity: "warn",
      message: "No GDPR consent recorded for this lead. If this lead is in the EU/EEA, explicit consent is required before sending commercial emails.",
      suggestion: "Verify whether this lead is subject to GDPR. If so, obtain explicit consent before outreach.",
    });
  }

  // GDPR: Right to erasure awareness
  results.push({
    passed: true,
    ruleId: "gdpr_right_to_erasure",
    ruleName: "GDPR Right to Erasure",
    severity: "info",
    message: "Ensure your data processing includes support for GDPR right to erasure (Article 17). Leads subject to GDPR can request deletion of their personal data at any time.",
  });

  return results;
}

// ─── Master Compliance Runner ─────────────────────────────────────────

export function runComplianceChecks(
  params: ComplianceCheckParams
): ComplianceCheckResult[] {
  const results: ComplianceCheckResult[] = [];

  // Channel-specific checks
  switch (params.channel) {
    case "linkedin":
      results.push(...checkLinkedInCompliance(params));
      break;
    case "email":
      results.push(...checkEmailCompliance(params));
      break;
    case "sms":
      results.push(...checkSmsCompliance(params));
      break;
    case "whatsapp":
      // WhatsApp follows similar rules to SMS for now
      results.push(...checkSmsCompliance(params));
      break;
    case "call":
      // Calls have fewer automated compliance checks; opt-out still applies
      if (params.hasUnsubscribed) {
        results.push({
          passed: false,
          ruleId: "call_opt_out",
          ruleName: "Call Opt-Out Respected",
          severity: "block",
          message: "This lead has opted out of communications. Do not call.",
          suggestion: "Remove this lead from call lists.",
        });
      }
      break;
  }

  // GDPR checks apply to all channels
  results.push(...checkGDPRCompliance(params));

  return results;
}

// ─── Compliance Summary ───────────────────────────────────────────────

export function getComplianceSummary(results: ComplianceCheckResult[]): {
  canSend: boolean;
  blockers: ComplianceCheckResult[];
  warnings: ComplianceCheckResult[];
  info: ComplianceCheckResult[];
} {
  const blockers = results.filter((r) => r.severity === "block" && !r.passed);
  const warnings = results.filter((r) => r.severity === "warn");
  const info = results.filter((r) => r.severity === "info");

  return {
    canSend: blockers.length === 0,
    blockers,
    warnings,
    info,
  };
}
