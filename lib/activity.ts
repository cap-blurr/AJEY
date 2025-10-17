export type ActivityItem = {
  id: string;
  type: string;
  status: "queued" | "running" | "success" | "error";
  timestamp: number;
  title: string;
  details?: string;
  trace?: string[];
  usage?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
};

const activity: ActivityItem[] = [];

export function addActivity(item: ActivityItem) {
  activity.unshift(item);
}

export function listActivity(): ActivityItem[] {
  return activity.slice(0, 50);
}


