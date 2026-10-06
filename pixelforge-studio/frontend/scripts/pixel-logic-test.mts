import { PixelBuffer, sameColor } from "../src/lib/pixel.ts";

const buffer = PixelBuffer.create(4, 4, [0, 0, 0, 0]);
buffer.set(0, 0, [255, 0, 0, 255]);
buffer.line(0, 0, 3, 0, [255, 0, 0, 255]);
if (!sameColor(buffer.get(3, 0)!, [255, 0, 0, 255])) throw new Error("line");

buffer.fill(1, 1, [0, 0, 255, 255]);
if (!sameColor(buffer.get(2, 2)!, [0, 0, 255, 255])) throw new Error("fill");
if (sameColor(buffer.get(0, 0)!, [0, 0, 255, 255])) throw new Error("fill leaked");

buffer.replaceColor([255, 0, 0, 255], [0, 255, 0, 255]);
if (!sameColor(buffer.get(3, 0)!, [0, 255, 0, 255])) throw new Error("replace");

buffer.rect(1, 1, 2, 2, [9, 9, 9, 255], false);
if (!sameColor(buffer.get(1, 1)!, [9, 9, 9, 255])) throw new Error("rect");

const flipped = buffer.clone();
flipped.mirrorHorizontal();
if (!sameColor(flipped.get(0, 0)!, buffer.get(3, 0)!)) throw new Error("mirror");

const cropped = buffer.crop(1, 1, 2, 2);
if (cropped.width !== 2 || cropped.height !== 2) throw new Error("crop");

const moved = PixelBuffer.create(4, 4);
const stamp = PixelBuffer.create(2, 2, [1, 2, 3, 255]);
moved.stamp(stamp, 2, 2);
if (!sameColor(moved.get(3, 3)!, [1, 2, 3, 255])) throw new Error("stamp");
if (moved.get(0, 0)![3] !== 0) throw new Error("stamp origin");

console.log("pixel logic ok");
