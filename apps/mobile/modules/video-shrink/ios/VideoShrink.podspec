Pod::Spec.new do |s|
  s.name           = 'VideoShrink'
  s.version        = '1.0.0'
  s.summary        = 'Re-encodes a video smaller, to fit an upload limit.'
  s.author         = 'Vera'
  s.homepage       = 'https://vera.chat'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
