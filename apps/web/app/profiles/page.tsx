import type { Metadata } from "next";
import { ProfileLauncher } from "../../store/shell/provider";

export const metadata: Metadata = { title: "Profiles" };
export default function ProfilesPage() {
  return (
    <section className="max-w-2xl py-16">
      <p className="eyebrow">MAKE IT YOURS</p>
      <h1 className="text-4xl font-semibold">Who is exploring?</h1>
      <p className="my-6 text-muted-foreground">
        Choose a local profile and language. The public collection needs no account; profiles use
        the local demonstration identity.
      </p>
      <ProfileLauncher label="Choose a profile" />
      <noscript>
        <p className="mt-4">
          Profile selection requires JavaScript. Public browsing and attribution remain available.
        </p>
      </noscript>
    </section>
  );
}
