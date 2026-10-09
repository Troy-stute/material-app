//go:build windows

// Mouse Mover: portable Windows-App, die die Maus in einem einstellbaren
// Intervall minimal bewegt, damit der PC nicht in Sperre/Standby geht und
// der Status nicht auf "Abwesend" wechselt. Nutzt nur die Win32-API,
// benötigt also keine Installation und keine Laufzeitumgebung.
package main

import (
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	copyright = "© 2026 Stutz"

	idOK     = 1 // kommt von der Enter-Taste über IsDialogMessage
	idEdit   = 101
	idButton = 102
	idCheck  = 103
	idGear   = 104
	idDesign = 200
	idTimer  = 1
)

var (
	dpi                                    = 96
	hEdit, hButton, hStatus, hChk          uintptr
	hGear, hCopy                           uintptr
	fontMain, fontSemi, fontTitle, fontSml uintptr
	f15                                    = true
	running                                bool
	interval, remaining                    int
	moves                                  int
	lastMove                               time.Time
)

// Einstellungen liegen portabel neben der Programmdatei (MouseMover.ini).
func iniPath() string {
	buf := make([]uint16, 1024)
	pGetModuleFileNameW.Call(0, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	p := syscall.UTF16ToString(buf)
	if i := strings.LastIndex(strings.ToLower(p), ".exe"); i >= 0 {
		p = p[:i]
	}
	return p + ".ini"
}

func iniGet(key, def string) string {
	buf := make([]uint16, 64)
	pGetPrivateProfileStringW.Call(str("Einstellungen"), str(key), str(def),
		uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), str(iniPath()))
	return syscall.UTF16ToString(buf)
}

func iniSet(key, val string) {
	pWritePrivateProfileStringW.Call(str("Einstellungen"), str(key), str(val), str(iniPath()))
}

func saveSettings() {
	iniSet("Design", th().key)
	iniSet("Intervall", getText(hEdit))
	iniSet("F15", map[bool]string{true: "1", false: "0"}[f15])
}

func loadSettings() (interval string) {
	d := iniGet("Design", "modern")
	for i, t := range themes {
		if t.key == d {
			cur = i
		}
	}
	f15 = iniGet("F15", "1") != "0"
	return iniGet("Intervall", "60")
}

// ctl merkt sich Position (bei 96 DPI) und Schrift eines Steuerelements,
// damit es bei einem Wechsel der Bildschirmskalierung neu gesetzt werden kann.
type ctl struct {
	h    uintptr
	r    *rect
	font *uintptr
}

var ctls []ctl

func control(parent uintptr, class, text string, style uintptr, r *rect, id int, font *uintptr) uintptr {
	hwnd, _, _ := pCreateWindowExW.Call(0, str(class), str(text), wsChild|wsVisible|style,
		0, 0, 0, 0, parent, uintptr(id), 0, 0)
	ctls = append(ctls, ctl{hwnd, r, font})
	return hwnd
}

// layout setzt alle Steuerelemente für die aktuelle Skalierung und das aktuelle Design.
func layout() {
	for _, c := range ctls {
		r := *c.r
		if c.h == hEdit && th().classic {
			r = rcEditCls
		}
		r = scaled(r)
		pMoveWindow.Call(c.h, uintptr(r.left), uintptr(r.top), uintptr(r.right-r.left), uintptr(r.bottom-r.top), 1)
		pSendMessageW.Call(c.h, wmSetFont, *c.font, 1)
	}
}

func createFonts() {
	for _, f := range []uintptr{fontMain, fontSemi, fontTitle, fontSml} {
		if f != 0 {
			pDeleteObject.Call(f)
		}
	}
	fontMain = createFont(9, 400)
	fontSemi = createFont(9, 600)
	fontTitle = createFont(13, 600)
	fontSml = createFont(8, 400)
}

const winStyle = uintptr(wsOverlapped | wsCaption | wsSysMenu | wsMinimizeBox | wsClipChildren)

var winW, winH int32 // feste Fenstergröße (inkl. Rahmen) für die aktuelle Skalierung

// resizeWindow bringt das Fenster exakt auf die Größe des Inhalts. Ohne
// Position wird es auf dem Arbeitsbereich seines Bildschirms zentriert.
func resizeWindow(hwnd uintptr, at *rect) {
	r := rect{0, 0, int32(scale(clientW)), int32(scale(clientH))}
	adjustWindowRect(&r, winStyle)
	winW, winH = r.right-r.left, r.bottom-r.top
	var x, y int32
	if at != nil {
		x, y = at.left, at.top
	} else {
		mon, _, _ := pMonitorFromWindow.Call(hwnd, 1) // MONITOR_DEFAULTTOPRIMARY
		mi := monitorInfo{cbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
		pGetMonitorInfoW.Call(mon, ptr(&mi))
		w := mi.rcWork
		x, y = w.left+(w.right-w.left-winW)/2, w.top+(w.bottom-w.top-winH)/2
	}
	pSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), uintptr(winW), uintptr(winH), swpNoZOrder|swpNoActivate)
}

// jiggle bewegt die Maus um 1 Pixel hin und zurück und drückt optional F15
// (eine Taste, die auf normalen Tastaturen nicht existiert und nichts auslöst).
func jiggle() {
	var in []input
	for _, dx := range []int32{1, -1} {
		i := input{typ: inputMouse}
		*(*mouseInput)(unsafe.Pointer(&i.data[0])) = mouseInput{dx: dx, flags: mouseMove}
		in = append(in, i)
	}
	if f15 {
		for _, f := range []uint32{0, keyUp} {
			i := input{typ: inputKeyboard}
			*(*keybdInput)(unsafe.Pointer(&i.data[0])) = keybdInput{vk: vkF15, flags: f}
			in = append(in, i)
		}
	}
	pSendInput.Call(uintptr(len(in)), uintptr(unsafe.Pointer(&in[0])), unsafe.Sizeof(in[0]))
	moves++
	lastMove = time.Now()
}

func updateStatus() {
	if !running {
		setText(hStatus, "Gestoppt")
		return
	}
	s := fmt.Sprintf("Aktiv – nächste Bewegung in %d s", remaining)
	if moves > 0 {
		s += fmt.Sprintf("\nBewegungen: %d (zuletzt %s)", moves, lastMove.Format("15:04:05"))
	}
	setText(hStatus, s)
}

func redraw(hwnd uintptr) {
	pRedrawWindow.Call(hwnd, 0, 0, rdwInvalidate|rdwErase|rdwAllChildren)
}

func start(hwnd uintptr) {
	n, err := strconv.Atoi(getText(hEdit))
	if err != nil || n < 1 {
		n = 60
	}
	if n > 3600 {
		n = 3600
	}
	setText(hEdit, strconv.Itoa(n))
	interval, remaining, moves, running = n, n, 0, true
	saveSettings()
	// Verhindert zusätzlich Standby und Bildschirmabschaltung, solange aktiv.
	pSetThreadExecutionState.Call(esContinuous | esSystemRequired | esDisplayRequired)
	pSetTimer.Call(hwnd, idTimer, 1000, 0)
	pEnableWindow.Call(hEdit, 0)
	updateStatus()
	redraw(hwnd)
}

func stop(hwnd uintptr) {
	running = false
	pKillTimer.Call(hwnd, idTimer)
	pSetThreadExecutionState.Call(esContinuous)
	pEnableWindow.Call(hEdit, 1)
	updateStatus()
	redraw(hwnd)
}

func wndProc(hwnd uintptr, m uint32, wParam, lParam uintptr) uintptr {
	switch m {
	case wmCommand:
		id, code := wParam&0xFFFF, wParam>>16&0xFFFF
		switch {
		case id == idButton || id == idOK:
			if running {
				stop(hwnd)
			} else {
				start(hwnd)
			}
			return 0
		case id == idCheck && (code == bnClicked || code == bnDoubleClick):
			f15 = !f15
			pInvalidateRect.Call(hChk, 0, 1)
			saveSettings()
			return 0
		case id == idGear && code == bnClicked:
			showDesignMenu(hwnd)
			return 0
		case id == idEdit && (code == enSetFocus || code == enKillFocus):
			editFocus = code == enSetFocus
			r := scaled(rcField)
			pInvalidateRect.Call(hwnd, ptr(&r), 1)
			return 0
		}
	case wmTimer:
		remaining--
		if remaining <= 0 {
			jiggle()
			remaining = interval
		}
		updateStatus()
		return 0
	case wmEraseBkgnd:
		var r rect
		pGetClientRect.Call(hwnd, ptr(&r))
		pFillRect.Call(wParam, ptr(&r), bgBrush)
		return 1
	case wmPaint:
		paintBackground(hwnd)
		return 0
	case wmDrawItem:
		onDrawItem((*drawItem)(unsafe.Pointer(lParam)))
		return 1
	case wmCtlColorEdit, wmCtlColorStatic:
		return onCtlColor(m, wParam, lParam)
	case wmGetMinMaxInfo:
		if winW > 0 { // Größe fixieren: kein Aufziehen, Maximieren oder Andocken
			mm := (*minMaxInfo)(unsafe.Pointer(lParam))
			size := point{winW, winH}
			mm.maxSize, mm.minTrackSize, mm.maxTrackSize = size, size, size
		}
		return 0
	case wmDpiChanged:
		dpi = int(wParam >> 16 & 0xFFFF)
		createFonts()
		layout()
		resizeWindow(hwnd, (*rect)(unsafe.Pointer(lParam)))
		redraw(hwnd)
		return 0
	case wmDestroy:
		saveSettings()
		pSetThreadExecutionState.Call(esContinuous)
		pPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(m), wParam, lParam)
	return r
}

func main() {
	runtime.LockOSThread()

	var token uintptr
	gpInput := struct {
		version  uint32
		callback uintptr
		s1, s2   int32
	}{version: 1}
	pGdiplusStartup.Call(ptr(&token), ptr(&gpInput), 0)

	hInst, _, _ := pGetModuleHandleW.Call(0)
	icon, _, _ := pLoadIconW.Call(hInst, 1) // eingebettetes Icon (Ressourcen-ID 1)
	if icon == 0 {
		icon, _, _ = pLoadIconW.Call(0, 32512)
	}
	cursor, _, _ := pLoadCursorW.Call(0, 32512)
	className := utf16("MouseMoverWindow")
	wc := wndClassEx{
		lpfnWndProc:   syscall.NewCallback(wndProc),
		hInstance:     hInst,
		hIcon:         icon,
		hIconSm:       icon,
		hCursor:       cursor,
		lpszClassName: className,
	}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	pRegisterClassExW.Call(ptr(&wc))

	// Fenster zuerst unsichtbar anlegen, dann nach der Skalierung seines
	// Bildschirms einrichten, auf exakte Größe bringen und erst dann zeigen.
	hwnd, _, _ := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(className)), str("Mouse Mover"),
		winStyle, 0, 0, 100, 100, 0, 0, hInst, 0)
	dpi = windowDPI(hwnd)
	createFonts()

	savedInterval := loadSettings()

	control(hwnd, "STATIC", "Mouse Mover", 0, &rcTitle, 0, &fontTitle)
	hGear = control(hwnd, "BUTTON", "Einstellungen", wsTabStop|bsOwnerDraw, &rcGear, idGear, &fontMain)
	control(hwnd, "STATIC", "Intervall (Sekunden)", 0, &rcLabel, 0, &fontMain)
	hEdit = control(hwnd, "EDIT", savedInterval, wsTabStop|esNumber|esCenter, &rcEditMod, idEdit, &fontMain)
	pSendMessageW.Call(hEdit, emLimitText, 4, 0)
	hChk = control(hwnd, "BUTTON", "Zusätzlich F15-Taste senden", wsTabStop|bsOwnerDraw, &rcToggle, idCheck, &fontMain)
	hButton = control(hwnd, "BUTTON", "Start", wsTabStop|bsOwnerDraw, &rcButton, idButton, &fontMain)
	hStatus = control(hwnd, "STATIC", "Gestoppt", 0, &rcStatus, 0, &fontMain)
	hCopy = control(hwnd, "STATIC", copyright, ssRight, &rcCopy, 0, &fontSml)

	resizeWindow(hwnd, nil)
	applyTheme(hwnd, cur)
	pShowWindow.Call(hwnd, swShow)
	pUpdateWindow.Call(hwnd)

	var m msg
	for {
		ret, _, _ := pGetMessageW.Call(ptr(&m), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		if r, _, _ := pIsDialogMessageW.Call(hwnd, ptr(&m)); r != 0 {
			continue
		}
		pTranslateMessage.Call(ptr(&m))
		pDispatchMessageW.Call(ptr(&m))
	}
}
