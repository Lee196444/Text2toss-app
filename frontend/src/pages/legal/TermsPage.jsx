import React from "react";
import LegalLayout from "./LegalLayout";

const TermsPage = () => (
  <LegalLayout title="Terms of Service" lastUpdated="February 12, 2026">
    <h2>1. Service Description</h2>
    <p>
      Text2toss provides on-demand junk-removal services in Flagstaff, Arizona and surrounding
      areas. Customers submit photos of items to be removed and receive an AI-generated
      preliminary estimate. By using this website, mobile experience, or any related service
      ("Service"), you agree to these Terms.
    </p>

    <h2>2. Estimates &amp; Pricing</h2>
    <p>
      Quotes generated from uploaded photos are <strong>preliminary estimates</strong> based on
      computer-vision analysis of the items shown. Final pricing is confirmed at the time of
      pickup once our team can physically inspect volume, weight, accessibility, and any
      hazardous-material restrictions. We will always communicate any change in price before
      starting work and obtain your approval to proceed.
    </p>

    <h2>3. Booking, Scheduling &amp; Payment</h2>
    <p>
      Bookings are scheduled on a first-come, first-served basis subject to crew availability.
      Payment is collected via Stripe before pickup unless prior arrangements are made.
      Authorized payment methods include all major credit/debit cards. By submitting a booking,
      you authorize Text2toss to charge the payment method provided for the total quoted
      amount (or any agreed-upon adjusted amount).
    </p>

    <h2>4. Cancellations</h2>
    <p>
      You may cancel a booking free of charge up to <strong>2 hours before the scheduled pickup
      window</strong>. Cancellations made within the 2-hour window may be subject to a $25
      trip fee at our discretion. See our <a href="/refund-policy">Refund Policy</a> for full details.
    </p>

    <h2>5. Items We Cannot Accept</h2>
    <p>
      For health, safety, and legal compliance reasons, we cannot accept: hazardous chemicals,
      asbestos, medical waste, explosives, ammunition, paint or solvents (unless dried),
      large quantities of tires, refrigerators or appliances containing refrigerant unless
      certified for safe disposal, or items containing personally identifiable information that
      hasn't been redacted. If such items are present at pickup, we may decline to remove them
      and charge a trip fee.
    </p>

    <h2>6. Property Access &amp; Liability</h2>
    <p>
      Customer warrants that they own the items to be removed (or have the owner's permission)
      and that our team has lawful access to the pickup location. Text2toss is not responsible
      for pre-existing damage to property, items left at the pickup site by mistake, or items
      claimed missing after pickup. Reasonable care is taken at all times, and our team is
      licensed and insured.
    </p>

    <h2>7. AI &amp; Photo Disclaimer</h2>
    <p>
      Our quote system uses artificial-intelligence vision to estimate price based on visual
      analysis. AI estimates can be wrong. You are responsible for the accuracy of any
      description, dimensions, or location information you provide. We reserve the right to
      revise the quote upward or downward at pickup based on actual conditions.
    </p>

    <h2>8. Photo Use</h2>
    <p>
      By submitting photos, you grant Text2toss a non-exclusive license to store and process
      those images for the purpose of generating quotes, fulfilling pickups, and improving our
      service. We will <strong>never publish identifiable photos of your property or items
      without separate written consent.</strong>
    </p>

    <h2>9. Limitation of Liability</h2>
    <p>
      To the maximum extent permitted by Arizona law, Text2toss's total liability under these
      Terms is limited to the amount paid by the customer for the specific job in question.
      We are not liable for indirect, consequential, or punitive damages.
    </p>

    <h2>10. Governing Law</h2>
    <p>
      These Terms are governed by the laws of the State of Arizona, without regard to its
      conflict-of-laws principles. Exclusive venue for any dispute lies in Coconino County,
      Arizona.
    </p>

    <h2>11. Changes to These Terms</h2>
    <p>
      We may update these Terms from time to time. The "Last updated" date at the top of this
      page reflects when changes were last made. Continued use of the Service after changes
      constitutes acceptance.
    </p>

    <h2>12. Contact</h2>
    <p>
      Questions about these Terms? Reach us at <a href="mailto:text2toss@gmail.com">text2toss@gmail.com</a>
      {" "}or call <a href="tel:9288539619">(928) 853-9619</a>.
    </p>
  </LegalLayout>
);

export default TermsPage;
