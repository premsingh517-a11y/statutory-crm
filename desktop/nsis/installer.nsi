; NeuSource Statutory CRM — per-user installer (built with native makensis, no Wine needed).
; Installs to the same folder and uninstall key as the earlier electron-builder installer,
; so it upgrades an existing install in place. Data in %APPDATA%\NeuSource Statutory CRM is never touched.
Unicode true
!include "MUI2.nsh"
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SRC
  !error "Pass /DSRC=<win-unpacked folder>"
!endif
!define APPNAME "NeuSource Statutory CRM"
!define EXENAME "NeuSource Statutory CRM.exe"
!define SHORTCUT "NeuSource CRM"
!define GUID "c16ca8ea-5353-5380-a4aa-0551435d3bad"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${GUID}"

Name "${APPNAME} ${VERSION}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\neusource-statutory-crm"
InstallDirRegKey HKCU "Software\${GUID}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "NeuSource Startup Minds India"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "NeuSource Startup Minds India"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "NeuSource Startup Minds India"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${SHORTCUT} now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; close a running copy so its files can be replaced
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  Sleep 1500
  SetOutPath "$INSTDIR"
  ; remove the old program files (not the data) before copying the new version
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall ${APPNAME}.exe"
  CreateShortCut "$DESKTOP\${SHORTCUT}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortCut "$SMPROGRAMS\${SHORTCUT}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  WriteRegStr HKCU "Software\${GUID}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPNAME} ${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "NeuSource Startup Minds India"
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
  ; your clients, CA firms and templates in %APPDATA%\NeuSource Statutory CRM are kept
SectionEnd
