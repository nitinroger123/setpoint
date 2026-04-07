import { Link } from 'react-router-dom'

/**
 * Terms and Conditions page.
 * Static legal copy covering use of the Setpoint platform.
 */
export default function Terms() {
  return (
    <div className="min-h-screen bg-cream-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-10">

        <Link to="/" className="text-sm text-forest-700 hover:underline mb-6 inline-block">
          ← Back to Setpoint
        </Link>

        <h1 className="text-3xl font-bold text-forest-900 mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 2026</p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-forest-900 mb-2">1. Acceptance of Terms</h2>
          <p className="text-gray-700 leading-relaxed">
            By accessing or using Setpoint ("the Platform"), you agree to be bound by these Terms
            and Conditions. If you do not agree, please do not use the Platform.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-forest-900 mb-2">2. Use of the Platform</h2>
          <p className="text-gray-700 leading-relaxed">
            Setpoint is a tournament management platform for recreational and competitive volleyball
            organizers and players. You agree to use the Platform only for lawful purposes and in
            a manner that does not infringe the rights of others.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-forest-900 mb-2">3. User Accounts</h2>
          <p className="text-gray-700 leading-relaxed">
            You are responsible for maintaining the confidentiality of your account credentials and
            for all activity that occurs under your account. Notify us immediately of any
            unauthorized use.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-forest-900 mb-2">4. Data &amp; Privacy</h2>
          <p className="text-gray-700 leading-relaxed">
            We collect player names, contact information, and match statistics to operate the
            Platform. We do not sell your data to third parties. Match results and standings may
            be publicly visible as part of the Platform's core functionality.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-forest-900 mb-2">5. Intellectual Property</h2>
          <p className="text-gray-700 leading-relaxed">
            All content, branding, and software on the Platform is the property of Setpoint and
            its operators. You may not reproduce, distribute, or create derivative works without
            explicit written permission.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-forest-900 mb-2">6. Limitation of Liability</h2>
          <p className="text-gray-700 leading-relaxed">
            The Platform is provided "as is" without warranties of any kind. Setpoint is not liable
            for any indirect, incidental, or consequential damages arising from your use of the
            Platform.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-forest-900 mb-2">7. Changes to Terms</h2>
          <p className="text-gray-700 leading-relaxed">
            We reserve the right to update these Terms at any time. Continued use of the Platform
            after changes constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-forest-900 mb-2">8. Contact</h2>
          <p className="text-gray-700 leading-relaxed">
            Questions about these Terms? Reach out through the Platform or contact the tournament
            organizer for your region.
          </p>
        </section>

      </div>
    </div>
  )
}
