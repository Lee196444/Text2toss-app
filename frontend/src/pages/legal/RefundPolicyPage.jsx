import React from "react";
import LegalLayout from "./LegalLayout";

const RefundPolicyPage = () => (
  <LegalLayout title="Refund Policy" lastUpdated="February 12, 2026">
    <p>
      We want every Text2toss customer to walk away happy. This policy explains when and how
      refunds work — written so there are no surprises.
    </p>

    <h2>1. Cancellations Before Pickup</h2>
    <ul>
      <li>
        <strong>More than 2 hours before scheduled pickup:</strong> 100% refund, no questions
        asked. We'll process the refund to your original payment method within 3-5 business days.
      </li>
      <li>
        <strong>Within 2 hours of pickup:</strong> Refund less a $25 trip fee if our crew has
        already been dispatched. If we haven't dispatched yet, full refund still applies.
      </li>
      <li>
        <strong>Same-day pickups:</strong> Once crew is en-route, the $25 trip fee applies on
        cancellation. Reschedules are free.
      </li>
    </ul>

    <h2>2. On-Site Price Adjustments</h2>
    <p>
      If the actual volume of items is materially less than the AI-quoted estimate, we will
      adjust the price downward and refund the difference. If the actual volume is more, we will
      provide a revised quote and obtain your approval before proceeding. You always have the
      right to decline the revised quote and pay only a $25 trip fee.
    </p>

    <h2>3. Items We Could Not Remove</h2>
    <p>
      If we are unable to remove an item due to safety, accessibility, or restricted-material
      reasons (see our <a href="/terms">Terms of Service §5</a>), the price for that item is
      removed from the total and refunded.
    </p>

    <h2>4. Damage Claims</h2>
    <p>
      If our team damages your property during a pickup, please notify us within{" "}
      <strong>48 hours</strong> at <a href="mailto:text2toss@gmail.com">text2toss@gmail.com</a>{" "}
      with photos. We carry liability insurance and will resolve verified claims promptly,
      either through direct repair, replacement, or refund.
    </p>

    <h2>5. Dissatisfaction &amp; Service Recovery</h2>
    <p>
      Not satisfied with the job? Call us at <a href="tel:9288539619">(928) 853-9619</a>{" "}
      within 7 days of pickup. We'll either return to address the issue at no extra charge or
      issue a partial refund — whichever you prefer.
    </p>

    <h2>6. How Refunds Are Processed</h2>
    <ul>
      <li>Refunds are issued to the <strong>original payment method</strong> used at booking.</li>
      <li>Stripe processes refunds within <strong>3-5 business days</strong>, though your bank may take additional time to post the credit.</li>
      <li>You will receive an email confirmation when the refund is issued.</li>
    </ul>

    <h2>7. Disputes &amp; Chargebacks</h2>
    <p>
      Before filing a dispute with your card issuer, please contact us directly. Most issues
      are resolved within 24 hours. Filing chargebacks before allowing us to resolve the issue
      may result in additional documentation requirements and delays.
    </p>

    <h2>8. Contact</h2>
    <p>
      Refund questions? <a href="mailto:text2toss@gmail.com">text2toss@gmail.com</a>{" "}
      · <a href="tel:9288539619">(928) 853-9619</a>
    </p>
  </LegalLayout>
);

export default RefundPolicyPage;
