  # Ships iOS from a CI macOS runner, so no Mac is needed locally. Differs from
  # `appstore_release` in three ways that only matter on CI:
  #   - credentials come from env vars, not ~/credentials/*.json
  #   - `setup_ci` makes a temporary keychain (a CI runner has no unlocked login keychain)
  #   - `match` supplies the signing identity instead of Xcode automatic signing,
  #     because automatic signing mints a NEW distribution certificate per run and
  #     Apple caps those at 3 per account — three green builds, then every build fails.
  desc "Build and ship from CI (no local Mac required)"
  lane :ci_appstore_release do |options|
    track              = (options[:track] || "testflight").to_s
    submit_for_review  = options[:submit_for_review].to_s == "true"
    upload_metadata    = options[:upload_metadata].to_s == "true"
    upload_screenshots = options[:upload_screenshots].to_s == "true"

    api_key = app_store_connect_api_key(
      key_id: ENV.fetch("ASC_KEY_ID"),
      issuer_id: ENV.fetch("ASC_ISSUER_ID"),
      key_content: ENV.fetch("ASC_PRIVATE_KEY"),
      is_key_content_base64: true,
      in_house: false
    )

    setup_ci if ENV["CI"]


    # readonly:false so the FIRST run can create and store the certificate. Later
    # runs find it already there and reuse it.
    # READONLY BY DEFAULT — this protects a scarce, account-wide resource.
    #
    # Apple issues at most TWO Apple Distribution certificates per developer
    # account, and they are shared by every app you ship. With readonly:false
    # match re-verifies against the portal on every build and mints a NEW
    # certificate whenever it is not satisfied — so a couple of unlucky builds
    # can consume both slots and lock the account out of iOS releases entirely.
    #
    # Set MATCH_READONLY=false for the single bootstrap run that populates an
    # empty store, then leave it unset.
    match(
      type: "appstore",
      app_identifier: bundle_id,
      api_key: api_key,
      readonly: ENV["MATCH_READONLY"].to_s != "false",
      keychain_name: ENV["MATCH_KEYCHAIN_NAME"],
      keychain_password: ENV["MATCH_KEYCHAIN_PASSWORD"]
    )

    # match publishes what it installed through these env vars.
    profile_name = ENV["sigh_#{bundle_id}_appstore_profile-name"]
    team_id      = ENV["sigh_#{bundle_id}_appstore_team-id"]
    UI.user_error!("match did not install a profile for #{bundle_id}") if profile_name.to_s.empty?

    # Signing must be set on the APP TARGET, and nowhere else.
    #
    # Through xcargs the settings hit EVERY target, and the Swift Package
    # dependencies (Firebase, GoogleUtilities, nanopb, promises...) reject a
    # provisioning profile outright — "does not support provisioning profiles".
    # This action edits the pbxproj for the named target only.
    #
    # It also has to be manual: left on automatic, Xcode hunts for an iOS App
    # DEVELOPMENT profile and fails, because match installed an App Store one.
    # The project ships no DEVELOPMENT_TEAM either, so team_id comes from match.
    update_code_signing_settings(
      path: "iosApp/iosApp.xcodeproj",
      use_automatic_signing: false,
      team_id: team_id,
      code_sign_identity: "Apple Distribution",
      profile_name: profile_name,
      targets: ["iosApp"],
      build_configurations: ["Release"]
    )

    build_app(
      scheme: "iosApp",
      project: "iosApp/iosApp.xcodeproj",
      configuration: "Release",
      export_method: "app-store",
      silent: false,
      output_name: "iosApp",
      output_directory: output_dir,
      export_options: {
        signingStyle: "manual",
        provisioningProfiles: { bundle_id => profile_name }
      }
    )

    ipa_path = File.join(output_dir, "iosApp.ipa")

    if track == "appstore"
      upload_to_app_store(
        api_key: api_key,
        ipa: ipa_path,
        skip_metadata: !upload_metadata,
        skip_screenshots: !upload_screenshots,
        skip_app_version_update: false,
        submit_for_review: submit_for_review,
        metadata_path: appstore_text_metadata_path,
        screenshots_path: appstore_screenshots_metadata_path,
        overwrite_screenshots: upload_screenshots,
        precheck_include_in_app_purchases: false,
        force: true
      )
      UI.success("Uploaded to App Store#{submit_for_review ? ' and submitted for review' : ''}.")
    else
      # TestFlight takes a build, not a store listing — metadata and screenshots
      # belong to the App Store version, so they are ignored on this track.
      UI.important("Ignoring metadata/screenshots: they apply to the appstore track.") if upload_metadata || upload_screenshots
      upload_to_testflight(
        api_key: api_key,
        ipa: ipa_path,
        skip_waiting_for_build_processing: true
      )
      UI.success("Uploaded to TestFlight.")
    end
  end
