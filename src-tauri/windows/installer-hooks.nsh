!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
  DeleteRegKey /ifempty SHCTX "${MANUKEY}"
!macroend
