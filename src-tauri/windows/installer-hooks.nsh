!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\Directory\shell\GithubDesk" "" "Abrir con GithubDesk"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\GithubDesk" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\GithubDesk\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\GithubDesk" "" "Abrir con GithubDesk"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\GithubDesk" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\GithubDesk\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\GithubDesk"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\GithubDesk"
  DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
  DeleteRegKey /ifempty SHCTX "${MANUKEY}"
!macroend
