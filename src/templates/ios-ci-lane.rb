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
    bump_build         = options[:bump_build].to_s != "false"

    api_key = app_store_connect_api_key(
      key_id: ENV.fetch("ASC_KEY_ID"),
      issuer_id: ENV.fetch("ASC_ISSUER_ID"),
      key_content: ENV.fetch("ASC_PRIVATE_KEY"),
      is_key_content_base64: true,
      in_house: false
    )

    setup_ci if ENV["CI"]

    # Apple rejects an already-seen build number, and CI builds from a clean
    # checkout — so the number in git never advances on its own. Take whatever
    # TestFlight has already seen and go one past it. This is the CI equivalent
    # of running `kappmaker update-version` before publishing locally.
    if bump_build
      latest = latest_testflight_build_number(
        api_key: api_key,
        app_identifier: bundle_id,
        initial_build_number: 0
      ) rescue 0
      increment_build_number(
        build_number: latest.to_i + 1,
        xcodeproj: "iosApp/iosApp.xcodeproj"
      )
      UI.message("Build number set to #{latest.to_i + 1}")
    end

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

    build_app(
      scheme: "iosApp",
      project: "iosApp/iosApp.xcodeproj",
      configuration: "Release",
      export_method: "app-store",
      silent: false,
      output_name: "iosApp",
      output_directory: output_dir,
      # Explicitly manual: match already installed the profile, and letting Xcode
      # "help" here is what causes the certificate churn described above.
      xcargs: "-allowProvisioningUpdates NO"
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
