//go:build windows

package main

import (
	"math"
	"syscall"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	uxtheme  = syscall.NewLazyDLL("uxtheme.dll")
	dwmapi   = syscall.NewLazyDLL("dwmapi.dll")
	gdiplus  = syscall.NewLazyDLL("gdiplus.dll")

	pRegisterClassExW   = user32.NewProc("RegisterClassExW")
	pCreateWindowExW    = user32.NewProc("CreateWindowExW")
	pDefWindowProcW     = user32.NewProc("DefWindowProcW")
	pGetMessageW        = user32.NewProc("GetMessageW")
	pIsDialogMessageW   = user32.NewProc("IsDialogMessageW")
	pTranslateMessage   = user32.NewProc("TranslateMessage")
	pDispatchMessageW   = user32.NewProc("DispatchMessageW")
	pPostQuitMessage    = user32.NewProc("PostQuitMessage")
	pSendMessageW       = user32.NewProc("SendMessageW")
	pSetWindowTextW     = user32.NewProc("SetWindowTextW")
	pGetWindowTextW     = user32.NewProc("GetWindowTextW")
	pEnableWindow       = user32.NewProc("EnableWindow")
	pSetTimer           = user32.NewProc("SetTimer")
	pKillTimer          = user32.NewProc("KillTimer")
	pSendInput          = user32.NewProc("SendInput")
	pLoadIconW          = user32.NewProc("LoadIconW")
	pLoadCursorW        = user32.NewProc("LoadCursorW")
	pGetDC              = user32.NewProc("GetDC")
	pReleaseDC          = user32.NewProc("ReleaseDC")
	pAdjustWindowRectEx = user32.NewProc("AdjustWindowRectEx")
	pGetSystemMetrics   = user32.NewProc("GetSystemMetrics")
	pShowWindow         = user32.NewProc("ShowWindow")
	pUpdateWindow       = user32.NewProc("UpdateWindow")
	pBeginPaint         = user32.NewProc("BeginPaint")
	pEndPaint           = user32.NewProc("EndPaint")
	pFillRect           = user32.NewProc("FillRect")
	pDrawTextW          = user32.NewProc("DrawTextW")
	pDrawFrameControl   = user32.NewProc("DrawFrameControl")
	pDrawFocusRect      = user32.NewProc("DrawFocusRect")
	pInvalidateRect     = user32.NewProc("InvalidateRect")
	pRedrawWindow       = user32.NewProc("RedrawWindow")
	pMoveWindow         = user32.NewProc("MoveWindow")
	pSetWindowPos       = user32.NewProc("SetWindowPos")
	pGetWindowLongPtrW  = user32.NewProc("GetWindowLongPtrW")
	pSetWindowLongPtrW  = user32.NewProc("SetWindowLongPtrW")
	pGetClientRect      = user32.NewProc("GetClientRect")
	pGetWindowRect      = user32.NewProc("GetWindowRect")
	pCreatePopupMenu    = user32.NewProc("CreatePopupMenu")
	pAppendMenuW        = user32.NewProc("AppendMenuW")
	pCheckMenuRadioItem = user32.NewProc("CheckMenuRadioItem")
	pTrackPopupMenu     = user32.NewProc("TrackPopupMenu")
	pDestroyMenu        = user32.NewProc("DestroyMenu")
	pGetDpiForWindow    = user32.NewProc("GetDpiForWindow")
	pAdjustForDpi       = user32.NewProc("AdjustWindowRectExForDpi")
	pMonitorFromWindow  = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfoW    = user32.NewProc("GetMonitorInfoW")

	pGetModuleHandleW           = kernel32.NewProc("GetModuleHandleW")
	pGetModuleFileNameW         = kernel32.NewProc("GetModuleFileNameW")
	pGetPrivateProfileStringW   = kernel32.NewProc("GetPrivateProfileStringW")
	pWritePrivateProfileStringW = kernel32.NewProc("WritePrivateProfileStringW")
	pSetThreadExecutionState    = kernel32.NewProc("SetThreadExecutionState")

	pGetDeviceCaps    = gdi32.NewProc("GetDeviceCaps")
	pCreateFontW      = gdi32.NewProc("CreateFontW")
	pCreateSolidBrush = gdi32.NewProc("CreateSolidBrush")
	pDeleteObject     = gdi32.NewProc("DeleteObject")
	pSelectObject     = gdi32.NewProc("SelectObject")
	pSetTextColor     = gdi32.NewProc("SetTextColor")
	pSetBkColor       = gdi32.NewProc("SetBkColor")
	pSetBkMode        = gdi32.NewProc("SetBkMode")

	pOpenThemeData       = uxtheme.NewProc("OpenThemeData")
	pCloseThemeData      = uxtheme.NewProc("CloseThemeData")
	pDrawThemeBackground = uxtheme.NewProc("DrawThemeBackground")

	pDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")

	pGdiplusStartup         = gdiplus.NewProc("GdiplusStartup")
	pGdipCreateFromHDC      = gdiplus.NewProc("GdipCreateFromHDC")
	pGdipDeleteGraphics     = gdiplus.NewProc("GdipDeleteGraphics")
	pGdipSetSmoothingMode   = gdiplus.NewProc("GdipSetSmoothingMode")
	pGdipSetPixelOffsetMode = gdiplus.NewProc("GdipSetPixelOffsetMode")
	pGdipCreatePath         = gdiplus.NewProc("GdipCreatePath")
	pGdipDeletePath         = gdiplus.NewProc("GdipDeletePath")
	pGdipAddPathArc         = gdiplus.NewProc("GdipAddPathArc")
	pGdipClosePathFigure    = gdiplus.NewProc("GdipClosePathFigure")
	pGdipCreateSolidFill    = gdiplus.NewProc("GdipCreateSolidFill")
	pGdipDeleteBrush        = gdiplus.NewProc("GdipDeleteBrush")
	pGdipCreatePen1         = gdiplus.NewProc("GdipCreatePen1")
	pGdipDeletePen          = gdiplus.NewProc("GdipDeletePen")
	pGdipFillPath           = gdiplus.NewProc("GdipFillPath")
	pGdipDrawPath           = gdiplus.NewProc("GdipDrawPath")
	pGdipFillEllipse        = gdiplus.NewProc("GdipFillEllipse")
	pGdipFillPolygon        = gdiplus.NewProc("GdipFillPolygon")
)

const (
	wsOverlapped   = 0x00000000
	wsCaption      = 0x00C00000
	wsSysMenu      = 0x00080000
	wsMinimizeBox  = 0x00020000
	wsClipChildren = 0x02000000
	wsChild        = 0x40000000
	wsVisible      = 0x10000000
	wsTabStop      = 0x00010000
	wsExClientEdge = 0x00000200
	esNumber       = 0x2000
	esCenter       = 0x0001
	bsOwnerDraw    = 0x000B
	ssRight        = 0x0002

	wmDestroy        = 0x0002
	wmGetMinMaxInfo  = 0x0024
	wmDpiChanged     = 0x02E0
	wmPaint          = 0x000F
	wmEraseBkgnd     = 0x0014
	wmDrawItem       = 0x002B
	wmSetFont        = 0x0030
	wmCommand        = 0x0111
	wmTimer          = 0x0113
	wmCtlColorEdit   = 0x0133
	wmCtlColorStatic = 0x0138
	emLimitText      = 0x00C5

	bnClicked     = 0
	bnDoubleClick = 5
	enSetFocus    = 0x0100
	enKillFocus   = 0x0200

	odsSelected = 0x0001
	odsFocus    = 0x0010

	inputMouse    = 0
	inputKeyboard = 1
	mouseMove     = 0x0001
	keyUp         = 0x0002
	vkF15         = 0x7E

	esContinuous      = 0x80000000
	esSystemRequired  = 0x00000001
	esDisplayRequired = 0x00000002

	logPixelsY = 90
	swShow     = 5

	dtCenter     = 0x0001
	dtVCenter    = 0x0004
	dtSingleLine = 0x0020
	dtLeft       = 0x0000

	dfcButton       = 4
	dfcsButtonCheck = 0x0000
	dfcsButtonPush  = 0x0010
	dfcsPushed      = 0x0200
	dfcsChecked     = 0x0400

	bpPushButton = 1
	bpCheckBox   = 3

	mfString    = 0x0000
	mfGrayed    = 0x0001
	mfSeparator = 0x0800
	tpmRightAln = 0x0008
	tpmReturnCm = 0x0100

	rdwInvalidate  = 0x0001
	rdwErase       = 0x0004
	rdwAllChildren = 0x0080
	rdwFrame       = 0x0400

	swpNoSize        = 0x0001
	swpNoMove        = 0x0002
	swpNoZOrder      = 0x0004
	swpNoActivate    = 0x0010
	swpFrameChanged  = 0x0020
	gwlExStyleOffset = -20

	dwmaCornerPreference = 33
	dwmaCaptionColor     = 35
	dwmaTextColor        = 36
	dwmColorDefault      = 0xFFFFFFFF
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

type paintStruct struct {
	hdc         uintptr
	fErase      int32
	rcPaint     rect
	fRestore    int32
	fIncUpdate  int32
	rgbReserved [32]byte
}

type drawItem struct {
	ctlType, ctlID, itemID, itemAction, itemState uint32
	hwndItem, hDC                                 uintptr
	rc                                            rect
	itemData                                      uintptr
}

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

type pointF struct{ x, y float32 }

type point struct{ x, y int32 }

type minMaxInfo struct {
	reserved, maxSize, maxPosition, minTrackSize, maxTrackSize point
}

type monitorInfo struct {
	cbSize    uint32
	rcMonitor rect
	rcWork    rect
	dwFlags   uint32
}

// windowDPI liefert die Skalierung des Bildschirms, auf dem das Fenster steht.
func windowDPI(hwnd uintptr) int {
	if pGetDpiForWindow.Find() == nil {
		if d, _, _ := pGetDpiForWindow.Call(hwnd); d > 0 {
			return int(d)
		}
	}
	hdc, _, _ := pGetDC.Call(0)
	defer pReleaseDC.Call(0, hdc)
	if d, _, _ := pGetDeviceCaps.Call(hdc, logPixelsY); d > 0 {
		return int(d)
	}
	return 96
}

// adjustWindowRect rechnet die Client- in die Fenstergröße um (inkl. Rahmen).
func adjustWindowRect(r *rect, style uintptr) {
	if pAdjustForDpi.Find() == nil {
		pAdjustForDpi.Call(ptr(r), style, 0, 0, uintptr(dpi))
		return
	}
	pAdjustWindowRectEx.Call(ptr(r), style, 0, 0)
}

func utf16(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func ptr[T any](v *T) uintptr { return uintptr(unsafe.Pointer(v)) }

func str(s string) uintptr { return uintptr(unsafe.Pointer(utf16(s))) }

// fl übergibt einen float32 an GDI+ (Go legt die ersten vier Argumente
// zusätzlich in die XMM-Register, wie es die x64-Aufrufkonvention verlangt).
func fl(v float32) uintptr { return uintptr(math.Float32bits(v)) }

func setText(h uintptr, s string) { pSetWindowTextW.Call(h, str(s)) }

func getText(h uintptr) string {
	buf := make([]uint16, 32)
	pGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return syscall.UTF16ToString(buf)
}

func createFont(pt, weight int) uintptr {
	f, _, _ := pCreateFontW.Call(uintptr(-(pt * dpi / 72)), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, str("Segoe UI"))
	return f
}

func drawText(hdc uintptr, s string, r rect, color colorRef, font uintptr, format uintptr) {
	pSetBkMode.Call(hdc, 1) // TRANSPARENT
	pSetTextColor.Call(hdc, uintptr(color))
	pSelectObject.Call(hdc, font)
	pDrawTextW.Call(hdc, str(s), ^uintptr(0), ptr(&r), format)
}

// gfx kapselt eine GDI+-Zeichenfläche mit Kantenglättung.
type gfx struct{ g uintptr }

func newGfx(hdc uintptr) gfx {
	var g uintptr
	pGdipCreateFromHDC.Call(hdc, ptr(&g))
	pGdipSetSmoothingMode.Call(g, 4)   // AntiAlias
	pGdipSetPixelOffsetMode.Call(g, 4) // Half
	return gfx{g}
}

func (x gfx) close() { pGdipDeleteGraphics.Call(x.g) }

func roundPath(l, t, w, h, r float32) uintptr {
	var p uintptr
	pGdipCreatePath.Call(0, ptr(&p))
	d := 2 * r
	pGdipAddPathArc.Call(p, fl(l), fl(t), fl(d), fl(d), fl(180), fl(90))
	pGdipAddPathArc.Call(p, fl(l+w-d), fl(t), fl(d), fl(d), fl(270), fl(90))
	pGdipAddPathArc.Call(p, fl(l+w-d), fl(t+h-d), fl(d), fl(d), fl(0), fl(90))
	pGdipAddPathArc.Call(p, fl(l), fl(t+h-d), fl(d), fl(d), fl(90), fl(90))
	pGdipClosePathFigure.Call(p)
	return p
}

// roundRect füllt ein abgerundetes Rechteck und zeichnet optional einen 1-px-Rand.
func (x gfx) roundRect(r rect, radius float32, fill color, border *color) {
	l, t := float32(r.left), float32(r.top)
	w, h := float32(r.right-r.left), float32(r.bottom-r.top)
	p := roundPath(l, t, w, h, radius)
	var b uintptr
	pGdipCreateSolidFill.Call(uintptr(fill.argb()), ptr(&b))
	pGdipFillPath.Call(x.g, b, p)
	pGdipDeleteBrush.Call(b)
	pGdipDeletePath.Call(p)
	if border != nil {
		p = roundPath(l+0.5, t+0.5, w-1, h-1, radius-0.5)
		var pen uintptr
		pGdipCreatePen1.Call(uintptr(border.argb()), fl(1), 2, ptr(&pen)) // UnitPixel
		pGdipDrawPath.Call(x.g, pen, p)
		pGdipDeletePen.Call(pen)
		pGdipDeletePath.Call(p)
	}
}

func (x gfx) ellipse(cx, cy, d float32, c color) {
	var b uintptr
	pGdipCreateSolidFill.Call(uintptr(c.argb()), ptr(&b))
	pGdipFillEllipse.Call(x.g, b, fl(cx-d/2), fl(cy-d/2), fl(d), fl(d))
	pGdipDeleteBrush.Call(b)
}

// gear zeichnet ein Zahnrad-Symbol (Einstellungen) mit Loch in der Hintergrundfarbe.
func (x gfx) gear(cx, cy, outer, inner, hole float32, c, bg color) {
	var pts []pointF
	for k := 0; k < 8; k++ {
		a := float64(k) * math.Pi / 4
		for _, s := range []struct {
			off float64
			rad float32
		}{{-0.40, inner}, {-0.20, outer}, {0.20, outer}, {0.40, inner}} {
			pts = append(pts, pointF{cx + s.rad*float32(math.Cos(a+s.off)), cy + s.rad*float32(math.Sin(a+s.off))})
		}
	}
	var b uintptr
	pGdipCreateSolidFill.Call(uintptr(c.argb()), ptr(&b))
	pGdipFillPolygon.Call(x.g, b, ptr(&pts[0]), uintptr(len(pts)), 0)
	pGdipDeleteBrush.Call(b)
	x.ellipse(cx, cy, 2*hole, bg)
}

// drawThemedPart zeichnet ein Windows-Standardelement (Button/Checkbox) im
// aktuellen Systemstil; ohne visuelle Stile fällt es auf DrawFrameControl zurück.
func drawThemedPart(hwnd, hdc uintptr, r rect, part, state int, fallback uintptr) {
	if th, _, _ := pOpenThemeData.Call(hwnd, str("BUTTON")); th != 0 {
		pDrawThemeBackground.Call(th, hdc, uintptr(part), uintptr(state), ptr(&r), 0)
		pCloseThemeData.Call(th)
		return
	}
	pDrawFrameControl.Call(hdc, ptr(&r), dfcButton, fallback)
}

func setDwmAttr(hwnd uintptr, attr int, value uint32) {
	if pDwmSetWindowAttribute.Find() == nil {
		pDwmSetWindowAttribute.Call(hwnd, uintptr(attr), ptr(&value), 4)
	}
}
