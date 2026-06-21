/** Wire types for the ActiveCampaign v3 API — the subset the connector reads.
 *  GET https://<account>.api-us1.com/api/3/contacts
 *  See https://developers.activecampaign.com/reference/list-all-contacts */

/** A contact as returned by GET /api/3/contacts. AC has native name/phone/email
 *  fields (unlike beehiiv). Many fields come back as strings ("0", "") — the
 *  transform treats empty/zero placeholders as absent. */
export type ACContact = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Created date, ISO-8601. */
  cdate?: string;
  /** Updated date, ISO-8601. */
  udate?: string;
  orgid?: string;
};

export type ACContactsPage = {
  contacts: ACContact[];
  meta?: {
    /** Total contacts matching the query — returned as a string. */
    total?: string;
  };
};

/** A list as returned by GET /api/3/lists. Used to resolve list NAMES → ids for the
 *  scoped, firewalled contact pull. */
export type ACList = {
  id: string;
  name: string;
  stringid?: string;
};

export type ACListsPage = {
  lists: ACList[];
  meta?: {
    total?: string;
  };
};
