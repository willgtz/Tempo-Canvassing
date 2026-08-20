"use client";

import { StatTile } from "@/components/dashboard/stat-tile";
import { BarChart, type BarChartItem } from "@/components/dashboard/bar-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { WidgetCustomizeMenu } from "@/components/dashboard/widget-customize-menu";
import { useWidgetVisibility } from "@/components/dashboard/use-widget-visibility";
import { Card } from "@/components/ui/card";

type Stats = {
  total: number;
  last7: number;
  last30: number;
  doorsKnocked30: number;
  doorsKnockedTotal30: number;
  withoutLocation: number;
  manual: number;
  trend30: { date: string; count: number }[];
  dispositionBreakdown: BarChartItem[];
  zipBreakdown: BarChartItem[];
};

const WIDGETS = [
  { id: "total", label: "Total leads assigned" },
  { id: "last7", label: "Created in last 7 days" },
  { id: "last30", label: "Created in last 30 days" },
  { id: "doorsKnocked", label: "Doors knocked (30 days)" },
  { id: "withoutLocation", label: "Leads without a location" },
  { id: "manual", label: "Manually entered leads" },
  { id: "trend", label: "Leads created — 30-day trend" },
  { id: "disposition", label: "Leads by disposition" },
  { id: "zip", label: "Leads by zip" },
];

export function RepDashboardClient({ stats }: { stats: Stats }) {
  const { isVisible, toggle } = useWidgetVisibility("rep-dashboard-hidden-widgets");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Your own stats, based on what you can currently see.
          </p>
        </div>
        <WidgetCustomizeMenu widgets={WIDGETS} isVisible={isVisible} onToggle={toggle} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isVisible("total") && <StatTile label="Total leads assigned" value={stats.total} />}
        {isVisible("last7") && <StatTile label="Created in last 7 days" value={stats.last7} />}
        {isVisible("last30") && <StatTile label="Created in last 30 days" value={stats.last30} />}
        {isVisible("doorsKnocked") && (
          <StatTile
            label="Doors knocked (30 days)"
            value={stats.doorsKnocked30}
            hint={
              stats.doorsKnockedTotal30 > stats.doorsKnocked30
                ? `${stats.doorsKnockedTotal30 - stats.doorsKnocked30} more not counted — too far from the lead's saved location`
                : undefined
            }
          />
        )}
        {isVisible("withoutLocation") && (
          <StatTile label="Leads without a location" value={stats.withoutLocation} />
        )}
        {isVisible("manual") && <StatTile label="Manually entered leads" value={stats.manual} />}
      </div>

      {isVisible("trend") && (
        <Card className="p-4">
          <h2 className="text-sm font-medium">Leads created — last 30 days</h2>
          <div className="mt-3">
            <TrendChart data={stats.trend30} />
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {isVisible("disposition") && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Leads by disposition</h2>
            <div className="mt-3">
              <BarChart items={stats.dispositionBreakdown} />
            </div>
          </Card>
        )}
        {isVisible("zip") && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Leads by zip</h2>
            <div className="mt-3">
              <BarChart items={stats.zipBreakdown} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
