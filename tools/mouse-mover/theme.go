//go:build windows

package main

import "unsafe"

type color struct{ r, g, b uint8 }

type colorRef uint32

func (c color) ref() colorRef { return colorRef(c.r) | colorRef(c.g)<<8 | colorRef(c.b)<<16 }
func (c color) argb() uint32  { return 0xFF000000 | uint32(c.r)<<16 | uint32(c.g)<<8 | uint32(c.b) }

type theme struct {
	key, name     string
	classic       bool // Windows-Standardelemente statt eigener Zeichnung
	bg, card      color
	cardBorder    color
	text, subtext color
	accent        color
	accentPressed color
	accentText    color
	field         color
	fieldDisabled color
	fieldBorder   color
	toggleOff     color
	caption       color
}

var themes = []theme{
	{
		key: "klassisch", name: "Klassisch", classic: true,
		bg: color{240, 240, 240}, card: color{240, 240, 240}, cardBorder: color{240, 240, 240},
		text: color{0, 0, 0}, subtext: color{90, 90, 90},
		accent: color{0, 120, 215}, accentPressed: color{0, 84, 153}, accentText: color{255, 255, 255},
		field: color{255, 255, 255}, fieldDisabled: color{240, 240, 240}, fieldBorder: color{122, 122, 122},
		toggleOff: color{51, 51, 51},
	},
	{
		key: "modern", name: "Modern",
		bg: color{243, 243, 243}, card: color{255, 255, 255}, cardBorder: color{229, 229, 229},
		text: color{27, 27, 27}, subtext: color{110, 110, 110},
		accent: color{0, 103, 192}, accentPressed: color{0, 80, 150}, accentText: color{255, 255, 255},
		field: color{255, 255, 255}, fieldDisabled: color{249, 249, 249}, fieldBorder: color{209, 209, 209},
		toggleOff: color{135, 135, 135}, caption: color{243, 243, 243},
	},
	{
		key: "pink", name: "Pink",
		bg: color{255, 240, 246}, card: color{255, 255, 255}, cardBorder: color{248, 205, 224},
		text: color{94, 26, 60}, subtext: color{176, 92, 132},
		accent: color{232, 62, 140}, accentPressed: color{196, 38, 112}, accentText: color{255, 255, 255},
		field: color{255, 255, 255}, fieldDisabled: color{253, 236, 244}, fieldBorder: color{240, 172, 204},
		toggleOff: color{214, 140, 178}, caption: color{255, 228, 240},
	},
}

// Layout in Pixeln bei 96 DPI (Clientbereich).
const clientW, clientH = 300, 286

var (
	rcTitle    = rect{20, 14, 220, 44}
	rcGear     = rect{252, 14, 280, 42}
	rcLabel    = rect{20, 66, 190, 86}
	rcField    = rect{196, 60, 280, 90}
	rcEditMod  = rect{204, 67, 272, 85}
	rcEditCls  = rect{196, 62, 280, 88}
	rcToggle   = rect{20, 104, 280, 134}
	rcButton   = rect{20, 146, 280, 184}
	rcCard     = rect{20, 198, 280, 250}
	rcStatus   = rect{32, 206, 268, 242}
	rcCopy     = rect{20, 262, 280, 280}
	cur        = 1 // aktives Design (Index in themes)
	bgBrush    uintptr
	cardBrush  uintptr
	fieldBrush uintptr
	fieldDis   uintptr
	editFocus  bool
)

func scale(v int) int { return v * dpi / 96 }

func scaled(r rect) rect {
	return rect{int32(scale(int(r.left))), int32(scale(int(r.top))), int32(scale(int(r.right))), int32(scale(int(r.bottom)))}
}

func th() *theme { return &themes[cur] }

func applyTheme(hwnd uintptr, i int) {
	cur = i
	t := th()
	for _, b := range []uintptr{bgBrush, cardBrush, fieldBrush, fieldDis} {
		if b != 0 {
			pDeleteObject.Call(b)
		}
	}
	bgBrush, _, _ = pCreateSolidBrush.Call(uintptr(t.bg.ref()))
	cardBrush, _, _ = pCreateSolidBrush.Call(uintptr(t.card.ref()))
	fieldBrush, _, _ = pCreateSolidBrush.Call(uintptr(t.field.ref()))
	fieldDis, _, _ = pCreateSolidBrush.Call(uintptr(t.fieldDisabled.ref()))

	// Eingabefeld: klassisch mit Windows-Rahmen, sonst randlos in eigenem Rahmen.
	gwl := gwlExStyleOffset
	ex, _, _ := pGetWindowLongPtrW.Call(hEdit, uintptr(gwl))
	if t.classic {
		ex |= wsExClientEdge
	} else {
		ex &^= wsExClientEdge
	}
	pSetWindowLongPtrW.Call(hEdit, uintptr(gwl), ex)
	pSetWindowPos.Call(hEdit, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoZOrder|swpFrameChanged)
	layout()

	// Titelleiste (wirkt ab Windows 11, ältere Versionen ignorieren es).
	if t.classic {
		setDwmAttr(hwnd, dwmaCaptionColor, dwmColorDefault)
		setDwmAttr(hwnd, dwmaTextColor, dwmColorDefault)
		setDwmAttr(hwnd, dwmaCornerPreference, 0)
	} else {
		setDwmAttr(hwnd, dwmaCaptionColor, uint32(t.caption.ref()))
		setDwmAttr(hwnd, dwmaTextColor, uint32(t.text.ref()))
		setDwmAttr(hwnd, dwmaCornerPreference, 2)
	}
	pRedrawWindow.Call(hwnd, 0, 0, rdwInvalidate|rdwErase|rdwAllChildren|rdwFrame)
}

// paintBackground zeichnet Statuskarte und Rahmen des Eingabefelds.
func paintBackground(hwnd uintptr) {
	var ps paintStruct
	hdc, _, _ := pBeginPaint.Call(hwnd, ptr(&ps))
	if t := th(); !t.classic {
		g := newGfx(hdc)
		g.roundRect(scaled(rcCard), float32(scale(8)), t.card, &t.cardBorder)
		fill, border := t.field, t.fieldBorder
		if running {
			fill = t.fieldDisabled
		} else if editFocus {
			border = t.accent
		}
		g.roundRect(scaled(rcField), float32(scale(5)), fill, &border)
		if editFocus && !running {
			// Akzentlinie unten wie bei Windows-11-Eingabefeldern
			f := scaled(rcField)
			g.roundRect(rect{f.left + 1, f.bottom - int32(scale(2)), f.right - 1, f.bottom}, 1, t.accent, nil)
		}
		g.close()
	}
	pEndPaint.Call(hwnd, ptr(&ps))
}

func onDrawItem(d *drawItem) {
	t := th()
	r := d.rc
	pFillRect.Call(d.hDC, ptr(&r), bgBrush)
	pressed := d.itemState&odsSelected != 0
	switch d.ctlID {
	case idButton:
		label := "Start"
		if running {
			label = "Stopp"
		}
		if t.classic {
			state, flags := 5, uintptr(dfcsButtonPush) // PBS_DEFAULTED
			if pressed {
				state, flags = 3, flags|dfcsPushed
			}
			drawThemedPart(d.hwndItem, d.hDC, r, bpPushButton, state, flags)
			drawText(d.hDC, label, r, t.text.ref(), fontMain, dtCenter|dtVCenter|dtSingleLine)
			if d.itemState&odsFocus != 0 {
				f := rect{r.left + 4, r.top + 4, r.right - 4, r.bottom - 4}
				pDrawFocusRect.Call(d.hDC, ptr(&f))
			}
			return
		}
		g := newGfx(d.hDC)
		fill, txt := t.accent, t.accentText
		var border *color
		if pressed {
			fill = t.accentPressed
		}
		if running { // Stopp als zurückhaltender Zweit-Button
			fill, txt, border = t.card, t.text, &t.fieldBorder
			if pressed {
				fill = t.bg
			}
		}
		g.roundRect(r, float32(scale(6)), fill, border)
		g.close()
		drawText(d.hDC, label, r, txt.ref(), fontSemi, dtCenter|dtVCenter|dtSingleLine)

	case idCheck:
		label := "Zusätzlich F15-Taste senden"
		mid := (r.top + r.bottom) / 2
		if t.classic {
			s := int32(scale(13))
			box := rect{r.left, mid - s/2, r.left + s, mid - s/2 + s}
			state, flags := 1, uintptr(dfcsButtonCheck)
			if f15 {
				state, flags = 5, flags|dfcsChecked
			}
			drawThemedPart(d.hwndItem, d.hDC, box, bpCheckBox, state, flags)
			tr := rect{r.left + int32(scale(20)), r.top, r.right, r.bottom}
			drawText(d.hDC, label, tr, t.text.ref(), fontMain, dtLeft|dtVCenter|dtSingleLine)
			return
		}
		drawText(d.hDC, label, r, t.text.ref(), fontMain, dtLeft|dtVCenter|dtSingleLine)
		w, h := int32(scale(40)), int32(scale(20))
		sw := rect{r.right - w, mid - h/2, r.right, mid - h/2 + h}
		knob := float32(scale(12))
		g := newGfx(d.hDC)
		y := float32(mid)
		if f15 {
			g.roundRect(sw, float32(h)/2, t.accent, nil)
			g.ellipse(float32(sw.right)-float32(scale(10)), y, knob, t.accentText)
		} else {
			g.roundRect(sw, float32(h)/2, t.card, &t.toggleOff)
			g.ellipse(float32(sw.left)+float32(scale(10)), y, knob, t.toggleOff)
		}
		g.close()

	case idGear:
		g := newGfx(d.hDC)
		bg := t.bg
		if t.classic {
			state, flags := 1, uintptr(dfcsButtonPush)
			if pressed {
				state, flags = 3, flags|dfcsPushed
			}
			g.close()
			drawThemedPart(d.hwndItem, d.hDC, r, bpPushButton, state, flags)
			g = newGfx(d.hDC)
		} else if pressed {
			bg = t.cardBorder
			g.roundRect(r, float32(scale(6)), bg, nil)
		}
		c := t.subtext
		if t.classic {
			c = t.text
		}
		cx, cy := float32(r.left+r.right)/2, float32(r.top+r.bottom)/2
		g.gear(cx, cy, float32(scale(9)), float32(scale(6))+0.5, float32(scale(3)), c, bg)
		g.close()
	}
}

// onCtlColor liefert Pinsel und Farben für Beschriftungen und das Eingabefeld.
func onCtlColor(m uint32, hdc, ctl uintptr) uintptr {
	t := th()
	pSetBkMode.Call(hdc, 2) // OPAQUE
	switch {
	case m == wmCtlColorEdit:
		pSetTextColor.Call(hdc, uintptr(t.text.ref()))
		pSetBkColor.Call(hdc, uintptr(t.field.ref()))
		return fieldBrush
	case ctl == hEdit: // deaktiviertes Eingabefeld
		pSetTextColor.Call(hdc, uintptr(t.subtext.ref()))
		pSetBkColor.Call(hdc, uintptr(t.fieldDisabled.ref()))
		return fieldDis
	case ctl == hStatus:
		pSetTextColor.Call(hdc, uintptr(t.text.ref()))
		pSetBkColor.Call(hdc, uintptr(t.card.ref()))
		return cardBrush
	case ctl == hCopy:
		pSetTextColor.Call(hdc, uintptr(t.subtext.ref()))
	default:
		pSetTextColor.Call(hdc, uintptr(t.text.ref()))
	}
	pSetBkColor.Call(hdc, uintptr(t.bg.ref()))
	return bgBrush
}

// showDesignMenu öffnet das Einstellungsmenü unter dem Zahnrad.
func showDesignMenu(hwnd uintptr) {
	m, _, _ := pCreatePopupMenu.Call()
	pAppendMenuW.Call(m, mfString|mfGrayed, 0, str("Design"))
	for i, t := range themes {
		pAppendMenuW.Call(m, mfString, uintptr(idDesign+i), str(t.name))
	}
	pCheckMenuRadioItem.Call(m, idDesign, uintptr(idDesign+len(themes)-1), uintptr(idDesign+cur), 0)
	var r rect
	pGetWindowRect.Call(hGear, uintptr(unsafe.Pointer(&r)))
	cmd, _, _ := pTrackPopupMenu.Call(m, tpmRightAln|tpmReturnCm, uintptr(r.right), uintptr(r.bottom), 0, hwnd, 0)
	pDestroyMenu.Call(m)
	if i := int(cmd) - idDesign; cmd != 0 && i >= 0 && i < len(themes) {
		applyTheme(hwnd, i)
		saveSettings()
	}
}
