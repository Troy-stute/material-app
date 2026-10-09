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
	"syscall"
	"time"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")

	pRegisterClassExW        = user32.NewProc("RegisterClassExW")
	pCreateWindowExW         = user32.NewProc("CreateWindowExW")
	pDefWindowProcW          = user32.NewProc("DefWindowProcW")
	pGetMessageW             = user32.NewProc("GetMessageW")
	pIsDialogMessageW        = user32.NewProc("IsDialogMessageW")
	pTranslateMessage        = user32.NewProc("TranslateMessage")
	pDispatchMessageW        = user32.NewProc("DispatchMessageW")
	pPostQuitMessage         = user32.NewProc("PostQuitMessage")
	pSendMessageW            = user32.NewProc("SendMessageW")
	pSetWindowTextW          = user32.NewProc("SetWindowTextW")
	pGetWindowTextW          = user32.NewProc("GetWindowTextW")
	pEnableWindow            = user32.NewProc("EnableWindow")
	pSetTimer                = user32.NewProc("SetTimer")
	pKillTimer               = user32.NewProc("KillTimer")
	pSendInput               = user32.NewProc("SendInput")
	pLoadIconW               = user32.NewProc("LoadIconW")
	pLoadCursorW             = user32.NewProc("LoadCursorW")
	pGetDC                   = user32.NewProc("GetDC")
	pReleaseDC               = user32.NewProc("ReleaseDC")
	pAdjustWindowRectEx      = user32.NewProc("AdjustWindowRectEx")
	pGetSystemMetrics        = user32.NewProc("GetSystemMetrics")
	pShowWindow              = user32.NewProc("ShowWindow")
	pUpdateWindow            = user32.NewProc("UpdateWindow")
	pGetModuleHandleW        = kernel32.NewProc("GetModuleHandleW")
	pSetThreadExecutionState = kernel32.NewProc("SetThreadExecutionState")
	pGetDeviceCaps           = gdi32.NewProc("GetDeviceCaps")
	pCreateFontW             = gdi32.NewProc("CreateFontW")
	pDeleteObject            = gdi32.NewProc("DeleteObject")
)

const (
	wsOverlapped   = 0x00000000
	wsCaption      = 0x00C00000
	wsSysMenu      = 0x00080000
	wsMinimizeBox  = 0x00020000
	wsChild        = 0x40000000
	wsVisible      = 0x10000000
	wsTabStop      = 0x00010000
	wsExClientEdge = 0x00000200
	esNumber       = 0x2000
	esCenter       = 0x0001
	bsDefPushBtn   = 0x0001
	bsAutoCheckBox = 0x0003

	wmDestroy  = 0x0002
	wmSetFont  = 0x0030
	wmCommand  = 0x0111
	wmTimer    = 0x0113
	bmGetCheck = 0x00F0
	bmSetCheck = 0x00F1
	emLimitTxt = 0x00C5

	inputMouse    = 0
	inputKeyboard = 1
	mouseMove     = 0x0001
	keyUp         = 0x0002
	vkF15         = 0x7E

	esContinuous      = 0x80000000
	esSystemRequired  = 0x00000001
	esDisplayRequired = 0x00000002

	colorBtnFace = 15
	logPixelsY   = 90
	swShow       = 5

	idEdit   = 101
	idButton = 102
	idCheck  = 103
	idTimer  = 1
	idOK     = 1
	ssRight  = 0x0002

	copyright = "© 2026 Stutz"
)

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	ptX     int32
	ptY     int32
	private uint32
}

type rect struct{ left, top, right, bottom int32 }

// input entspricht der Win32-Struktur INPUT (Union auf MOUSEINPUT-Größe).
type input struct {
	typ   uint32
	_     uint32
	data  [24]byte
	extra uintptr
}

type mouseInput struct {
	dx, dy    int32
	mouseData uint32
	flags     uint32
	time      uint32
}

type keybdInput struct {
	vk, scan uint16
	flags    uint32
	time     uint32
}

var (
	dpi                           = 96
	hEdit, hButton, hStatus, hChk uintptr
	running                       bool
	interval, remaining           int
	moves                         int
	lastMove                      time.Time
)

func utf16(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func scale(v int) int { return v * dpi / 96 }

func setText(h uintptr, s string) { pSetWindowTextW.Call(h, uintptr(unsafe.Pointer(utf16(s)))) }

func getText(h uintptr) string {
	buf := make([]uint16, 32)
	pGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return syscall.UTF16ToString(buf)
}

func control(parent uintptr, class, text string, style, exStyle uintptr, x, y, w, h, id int, font uintptr) uintptr {
	hwnd, _, _ := pCreateWindowExW.Call(exStyle,
		uintptr(unsafe.Pointer(utf16(class))), uintptr(unsafe.Pointer(utf16(text))),
		wsChild|wsVisible|style,
		uintptr(scale(x)), uintptr(scale(y)), uintptr(scale(w)), uintptr(scale(h)),
		parent, uintptr(id), 0, 0)
	pSendMessageW.Call(hwnd, wmSetFont, font, 1)
	return hwnd
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
	if r, _, _ := pSendMessageW.Call(hChk, bmGetCheck, 0, 0); r == 1 {
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
	// Verhindert zusätzlich Standby und Bildschirmabschaltung, solange aktiv.
	pSetThreadExecutionState.Call(esContinuous | esSystemRequired | esDisplayRequired)
	pSetTimer.Call(hwnd, idTimer, 1000, 0)
	pEnableWindow.Call(hEdit, 0)
	setText(hButton, "Stopp")
	updateStatus()
}

func stop(hwnd uintptr) {
	running = false
	pKillTimer.Call(hwnd, idTimer)
	pSetThreadExecutionState.Call(esContinuous)
	pEnableWindow.Call(hEdit, 1)
	setText(hButton, "Start")
	updateStatus()
}

func wndProc(hwnd uintptr, m uint32, wParam, lParam uintptr) uintptr {
	switch m {
	case wmCommand:
		// idOK (1) kommt von der Enter-Taste über IsDialogMessage.
		if id := wParam & 0xFFFF; id == idButton || id == idOK {
			if running {
				stop(hwnd)
			} else {
				start(hwnd)
			}
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
	case wmDestroy:
		pSetThreadExecutionState.Call(esContinuous)
		pPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(m), wParam, lParam)
	return r
}

func main() {
	runtime.LockOSThread()

	hdc, _, _ := pGetDC.Call(0)
	if d, _, _ := pGetDeviceCaps.Call(hdc, logPixelsY); d > 0 {
		dpi = int(d)
	}
	pReleaseDC.Call(0, hdc)

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
		hbrBackground: colorBtnFace + 1,
		lpszClassName: className,
	}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	style := uintptr(wsOverlapped | wsCaption | wsSysMenu | wsMinimizeBox)
	r := rect{0, 0, int32(scale(260)), int32(scale(200))}
	pAdjustWindowRectEx.Call(uintptr(unsafe.Pointer(&r)), style, 0, 0)
	w, h := r.right-r.left, r.bottom-r.top
	sw, _, _ := pGetSystemMetrics.Call(0)
	sh, _, _ := pGetSystemMetrics.Call(1)

	hwnd, _, _ := pCreateWindowExW.Call(0,
		uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(utf16("Mouse Mover"))),
		style, (sw-uintptr(w))/2, (sh-uintptr(h))/2, uintptr(w), uintptr(h), 0, 0, hInst, 0)

	fontHeight := -(9 * dpi / 72) // 9 pt
	font, _, _ := pCreateFontW.Call(uintptr(fontHeight), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0,
		uintptr(unsafe.Pointer(utf16("Segoe UI"))))
	defer pDeleteObject.Call(font)

	control(hwnd, "STATIC", "Intervall (Sekunden):", 0, 0, 16, 19, 140, 20, 0, font)
	hEdit = control(hwnd, "EDIT", "60", wsTabStop|esNumber|esCenter, wsExClientEdge, 164, 16, 80, 24, idEdit, font)
	pSendMessageW.Call(hEdit, emLimitTxt, 4, 0)
	hChk = control(hwnd, "BUTTON", "Zusätzlich F15-Taste senden", wsTabStop|bsAutoCheckBox, 0, 16, 50, 228, 22, idCheck, font)
	pSendMessageW.Call(hChk, bmSetCheck, 1, 0)
	hButton = control(hwnd, "BUTTON", "Start", wsTabStop|bsDefPushBtn, 0, 16, 82, 228, 32, idButton, font)
	hStatus = control(hwnd, "STATIC", "Gestoppt", 0, 0, 16, 126, 228, 40, 0, font)
	control(hwnd, "STATIC", copyright, ssRight, 0, 16, 174, 228, 20, 0, font)

	pShowWindow.Call(hwnd, swShow)
	pUpdateWindow.Call(hwnd)

	var m msg
	for {
		ret, _, _ := pGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		if r, _, _ := pIsDialogMessageW.Call(hwnd, uintptr(unsafe.Pointer(&m))); r != 0 {
			continue
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		pDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}
