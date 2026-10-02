Pod::Spec.new do |s|
  s.name           = 'MessageMenu'
  s.version        = '1.0.0'
  s.summary        = 'The native long-press menu on Vera messages.'
  s.description    = 'Wraps a message in a UIContextMenuInteraction with a reaction palette.'
  s.license        = 'UNLICENSED'
  s.author         = 'Vera'
  s.homepage       = 'https://vera.chat'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
end
