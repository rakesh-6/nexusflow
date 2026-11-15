import { ThemeSwitcher } from "../../components/ThemeSwitcher";
import { TokenPreview } from "../../components/TokenPreview";
import { PlaceholderPage } from "../PlaceholderPage";

// Profile settings: the appearance section already works; name, avatar and
// time zone arrive with accounts in Phase 2.
export default function ProfileSettingsPage() {
  return (
    <PlaceholderPage
      title="Profile"
      description="Your name, photo, time zone and appearance."
      phase="Phase 2"
      comingSoon="Edit your name, upload a profile photo and set your time zone once accounts exist."
    >
      <section aria-labelledby="appearance-heading" className="space-y-4">
        <div>
          <h2 id="appearance-heading" className="text-lg font-semibold">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose how NexusFlow looks on this device.
          </p>
        </div>
        <ThemeSwitcher />
        <TokenPreview />
      </section>
    </PlaceholderPage>
  );
}
