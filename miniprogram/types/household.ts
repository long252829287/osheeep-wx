export interface HouseholdSummary {
  id: number;
  name: string;
  timezone: string;
  memberCount: number;
}

export interface HouseholdCreatedResult {
  household: HouseholdSummary;
  inviteCode: string;
  inviteExpiresAt: string;
}
