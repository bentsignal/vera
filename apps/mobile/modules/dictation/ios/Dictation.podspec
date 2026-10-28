Pod::Spec.new do |s|
  s.name           = 'Dictation'
  s.version        = '1.0.0'
  s.summary        = 'On-device speech to text for the composer.'
  s.author         = 'Vera'
  s.homepage       = 'https://vera.chat'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'Speech'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
