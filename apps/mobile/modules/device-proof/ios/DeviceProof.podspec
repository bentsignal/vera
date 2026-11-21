Pod::Spec.new do |s|
  s.name           = 'DeviceProof'
  s.version        = '1.0.0'
  s.summary        = "Proves which phone a sign-up comes from, with Apple's DeviceCheck."
  s.author         = 'Vera'
  s.homepage       = 'https://vera.chat'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'DeviceCheck'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
