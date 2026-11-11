; Extra steps for the Windows installer (electron-builder's NSIS target, "include" in package.json).
; electron-builder only registers URL schemes on macOS, so frameling:// links are registered here, for the same
; place the app is installed (SHCTX is the current user or the whole machine, whichever the person chose).
!macro customInstall
  WriteRegStr SHCTX "Software\Classes\frameling" "" "URL:Frameling link"
  WriteRegStr SHCTX "Software\Classes\frameling" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\frameling\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\frameling\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\frameling"
!macroend
