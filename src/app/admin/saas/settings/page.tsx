import Link from "next/link";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery } from "@/lib/admin/data";
import { mergePlatformSettings } from "@/lib/subscription/access";
import { AdminHeading, AdminPanel, adminButton, adminInput, adminSecondary } from "../_components/admin-ui";
import { updateSaasSettingsAction } from "../actions";
import { SubscriptionActionButton } from "../subscriptions/_components/subscription-action-button";

export default async function SettingsPage() {
  const db = await getAdminReadClient();
  const { data, error } = await db.from("saas_platform_settings").select("id, trial_enabled, trial_duration_days, plan_display_name, plan_price_paise, plan_currency").eq("id", 1).maybeSingle();
  checkAdminQuery(error, "platform settings");
  const settings = mergePlatformSettings(data);
  const integrations = [
    { name: "Admin management", ready: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE), detail: "Required for cross-shop administrative changes." },
    { name: "Dodo Payments", ready: Boolean(process.env.DODO_PAYMENTS_API_KEY), detail: "Used for subscription checkout and billing." },
    { name: "WhatsApp", ready: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN), detail: "Used for invoice delivery and EMI reminders." },
    { name: "Email", ready: Boolean(process.env.RESEND_API_KEY), detail: "Used for transactional email." },
    { name: "Media storage", ready: Boolean(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET), detail: "Used for shop logos and product images." },
  ];
  return <div className="space-y-6"><AdminHeading title="Platform settings" description="Configure trials, legacy pricing defaults, and check connected service configuration." />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]"><AdminPanel title="Trials & defaults" description="Trial changes also affect access checks for existing trial shops."><form action={updateSaasSettingsAction} className="space-y-5 p-5"><label className="flex items-start gap-3 rounded-xl bg-stone-50 p-4"><input type="checkbox" name="trial_enabled" defaultChecked={settings.trial_enabled} className="mt-0.5 h-4 w-4 accent-stone-900" /><span><span className="block text-sm font-medium">Enable trial access</span><span className="mt-1 block text-xs leading-relaxed text-stone-500">Allow workspaces to use the product during their trial period.</span></span></label><label className="block text-xs font-medium text-stone-500">Trial duration (days)<input required type="number" min="1" max="365" name="trial_duration_days" defaultValue={settings.trial_duration_days} className={`${adminInput} mt-2`} /></label><div className="border-t border-stone-100 pt-5"><p className="text-sm font-medium">Legacy pricing defaults</p><p className="mt-1 text-xs leading-relaxed text-stone-500">The plan catalogue has its own pricing. Edit Starter, Growth, and Pro on the Plans page.</p></div><label className="block text-xs font-medium text-stone-500">Default plan name<input required minLength={2} maxLength={100} name="plan_display_name" defaultValue={settings.plan_display_name} className={`${adminInput} mt-2`} /></label><label className="block text-xs font-medium text-stone-500">Default price (INR)<input required type="number" min="0" max="1000000" step="0.01" name="plan_price_rupees" defaultValue={settings.plan_price_paise / 100} className={`${adminInput} mt-2`} /></label><div className="flex flex-wrap gap-2"><SubscriptionActionButton className={adminButton}>Save settings</SubscriptionActionButton><Link href="/admin/saas/plans" className={adminSecondary}>Manage plans</Link></div></form></AdminPanel>
    <AdminPanel title="Service configuration" description="Configuration presence only; this does not test live connectivity."><div className="divide-y divide-stone-100">{integrations.map(item => <div key={item.name} className="flex items-start justify-between gap-4 p-5"><div><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs leading-relaxed text-stone-500">{item.detail}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${item.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.ready ? "Configured" : "Missing"}</span></div>)}</div></AdminPanel></div>
  </div>;
}
