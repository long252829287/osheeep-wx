export interface RecipeSummary {
  id: number;
  name: string;
  imagePath?: string;
  category: string;
  flavor: string;
  estimatedMinutes: number;
}
