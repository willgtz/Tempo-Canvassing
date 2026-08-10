export const metadata = {
  title: "Privacy Policy",
};

// Reviewed 2026-08-07 against actual app behavior (schema.sql,
// LocationManager.swift's two call sites, Info.plist's permission
// strings) — every data type and use described below is something the
// app genuinely does today, nothing aspirational or copy-pasted from a
// template. Not a substitute for legal review: William should still read
// it himself and have counsel look it over if he wants that extra layer
// before pointing Apple at it, particularly the contact/business details
// in the Contact section below.
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 text-sm leading-relaxed">
      <div>
        <h1 className="text-xl font-semibold">Privacy Policy</h1>
        <p className="mt-1 text-black/60 dark:text-white/60">Last updated: August 7, 2026</p>
      </div>

      <p>
        Fenix Canvassing (&ldquo;the App&rdquo;) is an internal tool used by employees and
        contractors of Tempo Solar (&ldquo;we,&rdquo; &ldquo;us&rdquo;) to manage sales leads,
        appointments, and related work activity. The App is not available to the general public
        and is not intended for use by anyone outside our organization.
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Information we collect about App users (our staff)</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Name, email address, and phone number, used to create and manage your account.</li>
          <li>
            Your role and the sales territories (zip codes) assigned to you, used to determine
            what information you can see in the App.
          </li>
          <li>
            Your device&apos;s location, captured at two specific moments: (1) while actively
            using the route-planning feature, to calculate an efficient order for visiting
            assigned properties; and (2) at the moment you change a lead&apos;s status or add a
            note, to confirm you were near that property&apos;s address (&ldquo;door-knock
            verification&rdquo;) for internal activity-tracking purposes. In both cases, location
            is captured in the moment for that specific action and is not continuously tracked in
            the background.
          </li>
          <li>Records of actions you take in the App — status changes, notes, appointments you create or are assigned to — attributed to your account.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Information about sales leads and prospects</h2>
        <p>
          As part of normal business use, the App stores information about properties and
          prospective customers that our staff canvass or follow up with, which may include
          name, address, phone number, and email address. This information is provided by our
          company (via uploaded lead lists) or entered by staff in the field, not collected
          directly from prospects through the App itself.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">How we use this information</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>To operate the App&apos;s core functionality: assigning territories, tracking leads and appointments, and coordinating work between staff.</li>
          <li>To send you notifications (in-app and by email) about appointments relevant to you.</li>
          <li>To maintain accountability and an audit trail of changes made in the App.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Sharing</h2>
        <p>
          We do not sell or share this information with third parties for advertising purposes.
          Data is stored with our backend provider (Supabase) and, for email notifications, passed
          to our transactional email provider (Resend) solely to deliver that email. Route-planning
          directions are calculated via Apple Maps/MapKit on your device. Door-knock verification
          location (see above) is sent to and stored in our backend, since verifying proximity to a
          lead&apos;s address is done server-side — it is not shared with any other party.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Data retention and deletion</h2>
        <p>
          Account and work-activity data is retained for as long as your account is active and as
          needed for our business records. When your employment or contractor relationship with us
          ends, your account is deactivated by an administrator. To request deletion of your
          account and associated personal data, or to ask about a specific record, contact us using
          the information below — we will fulfill deletion requests except where we&apos;re
          required to retain certain records for legal, accounting, or business-integrity reasons
          (for example, an audit trail of work already performed).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Security</h2>
        <p>
          Access to data in the App is restricted by account role and assigned territory, enforced
          at the database level, not just in the app&apos;s interface. We use industry-standard
          providers (Supabase, Resend) for hosting and email delivery rather than operating our own
          servers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Children&apos;s privacy</h2>
        <p>
          The App is a workplace tool for our employees and contractors and is not directed at, or
          knowingly used by, children.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Contact</h2>
        <p>
          Questions about this policy, your data, or a deletion request can be sent to{" "}
          <a href="mailto:fenix@temposolarvegas.com" className="underline">
            fenix@temposolarvegas.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
