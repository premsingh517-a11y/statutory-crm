; ROC Docs Prepare — per-user installer (built with native makensis, no Wine needed).
; Upgrades the earlier version: closes it and removes its program files, shortcuts and uninstall entry.
; Your data in %APPDATA% is never deleted (the app moves it to its new folder on first start).
Unicode true
!include "MUI2.nsh"
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SRC
  !error "Pass /DSRC=<win-unpacked folder>"
!endif
!define APPNAME "ROC Docs Prepare"
!define EXENAME "ROC Docs Prepare.exe"
!define SHORTCUT "ROC Docs Prepare"
!define GUID "603ef1b8-8b2a-5229-9798-e066c6e037db"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${GUID}"
; the program's earlier name — used only to remove the old copy
!define OLDGUID "c16ca8ea-5353-5380-a4aa-0551435d3bad"
!define OLDEXE "NeuSource Statutory CRM.exe"
!define OLDLNK "NeuSource CRM"
!define OLDDIR "$LOCALAPPDATA\Programs\neusource-statutory-crm"

Name "${APPNAME} ${VERSION}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\roc-docs-prepare"
InstallDirRegKey HKCU "Software\${GUID}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${APPNAME}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${APPNAME}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APPNAME} now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; close running copies (new and old name) so their files can be replaced
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  nsExec::Exec 'taskkill /IM "${OLDEXE}" /F'
  Sleep 1500
  ; remove the earlier version's program files, shortcuts and uninstall entry (data stays)
  RMDir /r "${OLDDIR}"
  Delete "$DESKTOP\${OLDLNK}.lnk"
  Delete "$SMPROGRAMS\${OLDLNK}.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${OLDGUID}"
  DeleteRegKey HKCU "Software\${OLDGUID}"
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall ${APPNAME}.exe"
  CreateShortCut "$DESKTOP\${SHORTCUT}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortCut "$SMPROGRAMS\${SHORTCUT}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  WriteRegStr HKCU "Software\${GUID}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPNAME} ${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall ${APPNAME}.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall ${APPNAME}.exe" /S'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  Sleep 1000
  Delete "$DESKTOP\${SHORTCUT}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\${GUID}"
  ; your clients, CA firms and templates in %APPDATA%\ROC Docs Prepare are kept
SectionEnd
