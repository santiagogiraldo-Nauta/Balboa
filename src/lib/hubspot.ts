/**
 * HubSpot API Client
 *
 * Handles OAuth token management and API calls for:
 * - Contacts CRUD
 * - Deals CRUD
 * - Sequence enrollment
 * - Email engagement data
 */

const HUBSPOT_API_BASE = "https://api.hubapi.com";

// ─── Token Management ────────────────────────────────────────────

interface HubSpotTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function refreshHubSpotToken(refreshToken: string): Promise<HubSpotTokens> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("HubSpot OAuth credentials not configured (HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET)");
  }

  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HubSpot token refresh failed: ${text}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ─── API Helpers ─────────────────────────────────────────────────

export async function hubspotFetch(
  path: string,
  accessToken: string,
  opts?: {
    method?: string;
    body?: unknown;
  }
): Promise<unknown> {
  const url = `${HUBSPOT_API_BASE}${path}`;
  const response = await fetch(url, {
    method: opts?.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HubSpot API error (${response.status}): ${text}`);
  }

  return response.json();
}

// ─── Contacts ────────────────────────────────────────────────────

export interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    company?: string;
    jobtitle?: string;
    phone?: string;
    lifecyclestage?: string;
    hs_lead_status?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export async function getContacts(
  accessToken: string,
  opts?: { limit?: number; after?: string; properties?: string[] }
): Promise<{ results: HubSpotContact[]; paging?: { next?: { after: string } } }> {
  const params = new URLSearchParams();
  params.set("limit", String(opts?.limit || 100));
  if (opts?.after) params.set("after", opts.after);
  if (opts?.properties?.length) {
    params.set("properties", opts.properties.join(","));
  } else {
    params.set("properties", "email,firstname,lastname,company,jobtitle,phone,lifecyclestage,hs_lead_status");
  }

  const data = await hubspotFetch(
    `/crm/v3/objects/contacts?${params.toString()}`,
    accessToken
  );
  return data as { results: HubSpotContact[]; paging?: { next?: { after: string } } };
}

export async function getContactByEmail(
  accessToken: string,
  email: string
): Promise<HubSpotContact | null> {
  try {
    const data = await hubspotFetch(
      `/crm/v3/objects/contacts/${email}?idProperty=email&properties=email,firstname,lastname,company,jobtitle,phone,lifecyclestage`,
      accessToken
    );
    return data as HubSpotContact;
  } catch {
    return null;
  }
}

export async function createOrUpdateContact(
  accessToken: string,
  properties: Record<string, string>
): Promise<HubSpotContact> {
  const email = properties.email;
  if (!email) throw new Error("Email is required");

  // Try to find existing contact
  const existing = await getContactByEmail(accessToken, email);

  if (existing) {
    // Update
    const data = await hubspotFetch(
      `/crm/v3/objects/contacts/${existing.id}`,
      accessToken,
      { method: "PATCH", body: { properties } }
    );
    return data as HubSpotContact;
  }

  // Create
  const data = await hubspotFetch(
    "/crm/v3/objects/contacts",
    accessToken,
    { method: "POST", body: { properties } }
  );
  return data as HubSpotContact;
}

// ─── Deals ───────────────────────────────────────────────────────

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    pipeline?: string;
    closedate?: string;
    hs_lastmodifieddate?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export async function getDeals(
  accessToken: string,
  opts?: { limit?: number; after?: string; properties?: string[] }
): Promise<{ results: HubSpotDeal[]; paging?: { next?: { after: string } } }> {
  const params = new URLSearchParams();
  params.set("limit", String(opts?.limit || 100));
  if (opts?.after) params.set("after", opts.after);
  if (opts?.properties?.length) {
    params.set("properties", opts.properties.join(","));
  } else {
    params.set("properties", "dealname,amount,dealstage,pipeline,closedate");
  }

  const data = await hubspotFetch(
    `/crm/v3/objects/deals?${params.toString()}`,
    accessToken
  );
  return data as { results: HubSpotDeal[]; paging?: { next?: { after: string } } };
}

export async function createOrUpdateDeal(
  accessToken: string,
  dealId: string | null,
  properties: Record<string, string>,
  associations?: Array<{ to: { id: string }; types: Array<{ associationCategory: string; associationTypeId: number }> }>
): Promise<HubSpotDeal> {
  if (dealId) {
    const data = await hubspotFetch(
      `/crm/v3/objects/deals/${dealId}`,
      accessToken,
      { method: "PATCH", body: { properties } }
    );
    return data as HubSpotDeal;
  }

  const body: Record<string, unknown> = { properties };
  if (associations) body.associations = associations;

  const data = await hubspotFetch(
    "/crm/v3/objects/deals",
    accessToken,
    { method: "POST", body }
  );
  return data as HubSpotDeal;
}

// ─── Sequences ───────────────────────────────────────────────────

export interface HubSpotSequence {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export async function getSequences(
  accessToken: string
): Promise<HubSpotSequence[]> {
  try {
    const data = await hubspotFetch(
      "/automation/v3/sequences",
      accessToken
    ) as { results: HubSpotSequence[] };
    return data.results || [];
  } catch {
    return [];
  }
}

export async function enrollContactInSequence(
  accessToken: string,
  sequenceId: string,
  contactEmail: string,
  senderEmail: string
): Promise<boolean> {
  try {
    await hubspotFetch(
      `/automation/v3/sequences/${sequenceId}/enrollments`,
      accessToken,
      {
        method: "POST",
        body: {
          contactEmail,
          senderEmail,
        },
      }
    );
    return true;
  } catch (error) {
    console.error("[HubSpot] Sequence enrollment error:", error);
    return false;
  }
}

// ─── Email Engagement ────────────────────────────────────────────

export interface EmailEngagement {
  type: string; // SENT, DELIVERED, OPEN, CLICK, REPLY, BOUNCE
  timestamp: number;
  emailSubject?: string;
  recipientEmail?: string;
}

export async function getEmailEngagements(
  accessToken: string,
  contactId: string,
  limit: number = 50
): Promise<EmailEngagement[]> {
  try {
    const data = await hubspotFetch(
      `/crm/v3/objects/contacts/${contactId}/associations/emails?limit=${limit}`,
      accessToken
    ) as { results: Array<{ id: string }> };

    const engagements: EmailEngagement[] = [];

    for (const emailRef of (data.results || []).slice(0, 20)) {
      try {
        const emailData = await hubspotFetch(
          `/crm/v3/objects/emails/${emailRef.id}?properties=hs_email_subject,hs_email_status,hs_email_direction,hs_timestamp`,
          accessToken
        ) as { properties: Record<string, string> };

        engagements.push({
          type: emailData.properties.hs_email_status || "UNKNOWN",
          timestamp: parseInt(emailData.properties.hs_timestamp || "0"),
          emailSubject: emailData.properties.hs_email_subject,
        });
      } catch {
        // Skip individual email errors
      }
    }

    return engagements;
  } catch {
    return [];
  }
}

// ─── Custom Properties ───────────────────────────────────────────

export async function createCustomProperty(
  accessToken: string,
  objectType: "contacts" | "deals",
  property: {
    name: string;
    label: string;
    type: "string" | "number" | "datetime" | "enumeration";
    fieldType: "text" | "number" | "date" | "select";
    groupName: string;
    description?: string;
    options?: Array<{ label: string; value: string }>;
  }
): Promise<boolean> {
  try {
    await hubspotFetch(
      `/crm/v3/properties/${objectType}`,
      accessToken,
      { method: "POST", body: property }
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Webhook Subscription ────────────────────────────────────────

export function getOAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) {
    throw new Error("HubSpot OAuth not configured (HUBSPOT_CLIENT_ID missing)");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write automation",
    state,
  });

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<HubSpotTokens> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("HubSpot OAuth credentials not configured");
  }

  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HubSpot code exchange failed: ${text}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
