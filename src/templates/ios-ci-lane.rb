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
    match(
      type: "appstore",
      app_identifier: bundle_id,
      api_key: api_key,
      readonly: false,
      keychain_name: ENV["MATCH_KEYCHAIN_NAME"],
      keychain_password: ENV["MATCH_KEYCHAIN_PASSWORD"]
    )

    # match publishes the profile it installed through these env vars.
    profile_name = ENV["sigh_#{bundle_id}_appstore_profile-name"]
    team_id      = ENV["sigh_#{bundle_id}_appstore_team-id"]
    UI.user_error!("match did not install a profile for #{bundle_id}") if profile_name.to_s.empty?

    build_app(
      scheme: "iosApp",
      project: "iosApp/iosApp.xcodeproj",
      configuration: "Release",
      export_method: "app-store",
      silent: false,
      output_name: "iosApp",
      output_directory: output_dir,
      # Manual signing with exactly the profile match installed. NOT
      # -allowProvisioningUpdates: that flag takes no value (passing one makes
      # xcodebuild read it as a build action) and letting Xcode manage profiles
      # is what causes the certificate churn described above.
      xcargs: "CODE_SIGN_STYLE=Manual " \
              "PROVISIONING_PROFILE_SPECIFIER='#{profile_name}' " \
              "DEVELOPMENT_TEAM='#{team_id}'",
      export_options: {
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
