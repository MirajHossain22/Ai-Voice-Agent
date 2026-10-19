import type { AppConfig } from '../config.js';

type HubSpotContact = { id: string; name: string; phone: string };

type HubSpotClient = {
  findContact: (phone: string) => Promise<HubSpotContact | null>;
  syncContact: (input: {
    name: string;
    phone: string;
  }) => Promise<HubSpotContact>;
};

export function createHubSpotClient(config: AppConfig): HubSpotClient | null {
  const configuredHubSpot = config.hubspot;
  if (!configuredHubSpot) return null;
  const settings = configuredHubSpot;

  async function request(path: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= settings.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
      try {
        const response = await fetch(`https://api.hubapi.com${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${settings.accessToken}`,
            'content-type': 'application/json',
            ...init.headers,
          },
        });
        if (response.status >= 500 && attempt < settings.retries) continue;
        if (!response.ok) {
          throw new Error(`HubSpot request failed (${response.status})`);
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === settings.retries) throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('HubSpot request failed');
  }

  async function search(phone: string): Promise<HubSpotContact | null> {
    const response = await request('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }],
          },
        ],
        properties: ['firstname', 'lastname', 'phone'],
        limit: 1,
      }),
    });
    const body = (await response.json()) as {
      results?: { id: string; properties?: Record<string, string> }[];
    };
    const result = body.results?.[0];
    if (!result) return null;
    return {
      id: result.id,
      name: [result.properties?.firstname, result.properties?.lastname]
        .filter(Boolean)
        .join(' '),
      phone: result.properties?.phone ?? phone,
    };
  }

  return {
    findContact: search,
    async syncContact({ name, phone }) {
      const existing = await search(phone);
      const nameParts = name.trim().split(/\s+/);
      const properties = {
        firstname: nameParts[0] ?? name,
        lastname: nameParts.slice(1).join(' '),
        phone,
      };
      const response = existing
        ? await request(`/crm/v3/objects/contacts/${existing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties }),
          })
        : await request('/crm/v3/objects/contacts', {
            method: 'POST',
            body: JSON.stringify({ properties }),
          });
      const body = (await response.json()) as {
        id: string;
        properties?: Record<string, string>;
      };
      return {
        id: body.id,
        name,
        phone: body.properties?.phone ?? phone,
      };
    },
  };
}
