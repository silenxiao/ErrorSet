import { expect, it } from "vitest";
import { cropPixels } from "./imageCrop";
it("全图保留原始像素与比例", () => {
  expect(cropPixels({ x:0, y:0, width:1, height:1 }, 3000,4000)).toEqual({x:0,y:0,width:3000,height:4000});
});
it("预览框映射到原图坐标", () => {
  expect(cropPixels({x:0.1,y:0.2,width:0.5,height:0.6},3000,4000)).toEqual({x:300,y:800,width:1500,height:2400});
});
it("边缘选框不会越界或形成零尺寸", () => {
  expect(cropPixels({x:1,y:1,width:0,height:0},3000,4000)).toEqual({x:2999,y:3999,width:1,height:1});
});
