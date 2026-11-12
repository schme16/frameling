; Extra steps for the Windows installer (electron-builder's NSIS target, "include" in package.json).
; electron-builder only registers URL schemes on macOS, so frameling:// links are registered here, for the same
; place the app is installed (SHCTX is the current user or the whole machine, whichever the person chose).
; Aseprite files (.aseprite, .ase): Frameling is added to "Open with", and only there. electron-builder's
; fileAssociations would make it the handler, so they are not used. The extension keys are only given an
; OpenWithProgids entry; their default value (the program that opens a double-click) is never read or written.
!macro customInstall
  WriteRegStr SHCTX "Software\Classes\frameling" "" "URL:Frameling link"
  WriteRegStr SHCTX "Software\Classes\frameling" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\frameling\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\frameling\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\Frameling.Aseprite" "" "Aseprite sprite"
  WriteRegStr SHCTX "Software\Classes\Frameling.Aseprite" "FriendlyTypeName" "Aseprite sprite"
  WriteRegStr SHCTX "Software\Classes\Frameling.Aseprite\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\Frameling.Aseprite\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\.aseprite\OpenWithProgids" "Frameling.Aseprite" ""
  WriteRegStr SHCTX "Software\Classes\.ase\OpenWithProgids" "Frameling.Aseprite" ""
  ; Tell Explorer the list changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\frameling"
  DeleteRegValue SHCTX "Software\Classes\.aseprite\OpenWithProgids" "Frameling.Aseprite"
  DeleteRegValue SHCTX "Software\Classes\.ase\OpenWithProgids" "Frameling.Aseprite"
  DeleteRegKey SHCTX "Software\Classes\Frameling.Aseprite"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
