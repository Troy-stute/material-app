// icongen erzeugt mousemover.ico (Maus-Symbol) für die Ressourcen-Einbettung.
package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
)

func render(size int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	f := float64(size) / 32
	body := color.NRGBA{0x25, 0x63, 0xeb, 0xff}
	line := color.NRGBA{0xff, 0xff, 0xff, 0xff}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			px, py := (float64(x)+0.5)/f, (float64(y)+0.5)/f
			// Mausgehäuse: Rechteck mit stark abgerundeten Ecken
			dx := math.Max(math.Abs(px-16)-4, 0)
			dy := math.Max(math.Abs(py-16)-8, 0)
			if math.Hypot(dx, dy) > 6 {
				continue
			}
			c := body
			// Trennlinie zwischen den Tasten und Mausrad
			if (math.Abs(px-16) < 0.8 && py < 13) || (math.Abs(py-13) < 0.8 && px > 7 && px < 25) {
				c = line
			}
			if math.Abs(px-16) < 1.4 && py > 6.5 && py < 10.5 {
				c = line
			}
			img.SetNRGBA(x, y, c)
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

func main() {
	sizes := []int{16, 24, 32, 48, 256}
	var imgs [][]byte
	for _, s := range sizes {
		imgs = append(imgs, render(s))
	}
	var out bytes.Buffer
	binary.Write(&out, binary.LittleEndian, [3]uint16{0, 1, uint16(len(sizes))})
	offset := 6 + 16*len(sizes)
	for i, s := range sizes {
		w := byte(s)
		if s == 256 {
			w = 0
		}
		out.Write([]byte{w, w, 0, 0})
		binary.Write(&out, binary.LittleEndian, [2]uint16{1, 32})
		binary.Write(&out, binary.LittleEndian, [2]uint32{uint32(len(imgs[i])), uint32(offset)})
		offset += len(imgs[i])
	}
	for _, b := range imgs {
		out.Write(b)
	}
	os.WriteFile(os.Args[1], out.Bytes(), 0o644)
}
