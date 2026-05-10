import React from "react";
import LegalLayout from "./LegalLayout";

const PrivacyPage = () => (
  <LegalLayout title="Privacy Policy" lastUpdated="February 12, 2026">
    <p>
      Text2toss ("we," "us," "our") respects your privacy. This policy explains what we
      collect, why, and how you can control it.
    </p>

    <h2>Information We Collect</h2>
    <ul>
      <li><strong>Contact details</strong> — name, phone, email, pickup address (provided when you book).</li>
      <li><strong>Photos</strong> — images you upload of items to be removed.</li>
      <li><strong>Payment information</strong> — processed by Stripe; we never store full card numbers.</li>
      <li><strong>Usage data</strong> — anonymized analytics (page views, button clicks) to improve the site.</li>
    </ul>

    <h2>How We Use It</h2>
    <ul>
      <li>Generate quotes and fulfill pickups.</li>
      <li>Process payments and issue refunds when applicable.</li>
      <li>Send transactional emails/SMS (booking confirmation, reminders, completion).</li>
      <li>Improve our AI quoting accuracy (de-identified analysis only).</li>
      <li>Comply with legal obligations (tax, dispute resolution).</li>
    </ul>

    <h2>Who We Share It With</h2>
    <p>
      We share data only with third parties strictly necessary to operate the Service:
    </p>
    <ul>
      <li><strong>Stripe</strong> — payment processing.</li>
      <li><strong>Email/SMS providers</strong> — to send confirmations and reminders.</li>
      <li><strong>AI providers (Google Gemini, OpenAI)</strong> — to analyze uploaded photos for pricing. Photos are sent solely for inference and are not retained for training.</li>
      <li><strong>Cloud storage (Emergent Object Storage)</strong> — to host uploaded images.</li>
      <li><strong>Law enforcement</strong> — only when required by valid legal process.</li>
    </ul>
    <p>
      We <strong>do not sell or rent</strong> your personal information to third parties.
    </p>

    <h2>Data Retention</h2>
    <p>
      We keep booking records for a minimum of <strong>7 years</strong> to satisfy U.S. tax and
      financial-record-keeping requirements. Uploaded photos are retained only while needed for
      the active job and routine cache (typically deleted within 30 days). You can request
      earlier deletion of your photos at any time.
    </p>

    <h2>Your Rights</h2>
    <p>
      You may request to access, correct, or delete your personal information. Email{" "}
      <a href="mailto:text2toss@gmail.com">text2toss@gmail.com</a> from the address on file and we
      will respond within 30 days. Arizona, California, and other state-specific privacy rights
      (e.g., the CCPA right to opt-out of sale, which is moot since we don't sell data) apply
      where required.
    </p>

    <h2>Cookies &amp; Tracking</h2>
    <p>
      We use only essential cookies (session/auth) and a small amount of first-party analytics
      to understand traffic patterns. We do not use cross-site advertising trackers. You can
      block cookies via your browser settings; the booking flow will continue to work.
    </p>

    <h2>Children</h2>
    <p>
      Text2toss is not intended for users under 18. We do not knowingly collect personal
      information from children.
    </p>

    <h2>Security</h2>
    <p>
      We use industry-standard practices (HTTPS, encrypted storage, restricted admin access,
      Stripe-managed payment data) to protect your information. No system is 100% secure; in
      the unlikely event of a breach affecting your data, we will notify you in accordance with
      applicable law.
    </p>

    <h2>Changes to This Policy</h2>
    <p>
      We may update this policy from time to time. The "Last updated" date above reflects the
      latest revision.
    </p>

    <h2>Contact</h2>
    <p>
      Privacy questions? <a href="mailto:text2toss@gmail.com">text2toss@gmail.com</a>{" "}
      · <a href="tel:9288539619">(928) 853-9619</a>.
    </p>
  </LegalLayout>
);

export default PrivacyPage;
