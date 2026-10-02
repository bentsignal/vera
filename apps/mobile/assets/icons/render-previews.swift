import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true)
let themes:[(String,String)]=[("indigo","4f46e5"),("blue","007aff"),("teal","0d9488"),("green","16a34a"),("orange","ea580c"),("pink","db2777"),("purple","7c3aed"),("graphite","3a3a3c")]
let space=CGColorSpace(name:CGColorSpace.sRGB)!
func rgb(_ hex:String)->[CGFloat] {let n=UInt32(hex,radix:16)!;return [CGFloat((n>>16)&255)/255,CGFloat((n>>8)&255)/255,CGFloat(n&255)/255]}
func mix(_ c:[CGFloat],_ t:CGFloat,_ a:CGFloat)->[CGFloat] {c.map{$0+(t-$0)*a}}
func color(_ c:[CGFloat],_ a:CGFloat=1)->CGColor {CGColor(colorSpace:space,components:c+[a])!}
let svg=try! String(contentsOf:root.appendingPathComponent("vera-indigo.icon/Assets/bubble-v.svg"),encoding:.utf8)
let data=svg.components(separatedBy:"d=\"")[1].components(separatedBy:"\"")[0].split(separator:" ").map(String.init)
let path=CGMutablePath()
var i=0
func number()->CGFloat{defer{i+=1};return CGFloat(Double(data[i])!)}
func point()->CGPoint{CGPoint(x:number(),y:number())}
while i<data.count {
 let cmd=data[i];i+=1
 switch cmd {
 case "M":path.move(to:point())
 case "L":path.addLine(to:point())
 case "H":path.addLine(to:CGPoint(x:number(),y:path.currentPoint.y))
 case "V":path.addLine(to:CGPoint(x:path.currentPoint.x,y:number()))
 case "C":let a=point(),b=point(),c=point();path.addCurve(to:c,control1:a,control2:b)
 case "Q":let a=point(),b=point();path.addQuadCurve(to:b,control:a)
 case "Z":path.closeSubpath()
 default:fatalError(cmd)
 }
}
func gradient(_ ctx:CGContext,_ cs:[[CGFloat]],_ start:CGPoint,_ end:CGPoint){
 let g=CGGradient(colorsSpace:space,colors:cs.map{color($0)} as CFArray,locations:[0,1])!
 ctx.drawLinearGradient(g,start:start,end:end,options:[.drawsBeforeStartLocation,.drawsAfterEndLocation])
}
func write(_ img:CGImage,_ name:String){
 let d=CGImageDestinationCreateWithURL(root.appendingPathComponent(name) as CFURL,UTType.png.identifier as CFString,1,nil)!
 CGImageDestinationAddImage(d,img,nil);precondition(CGImageDestinationFinalize(d))
}
func context(_ size:Int)->CGContext {CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:0,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!}
func render(_ name:String,_ theme:[CGFloat],_ mode:String){
 let ctx=context(2048);ctx.scaleBy(x:2,y:2);ctx.translateBy(x:0,y:1024);ctx.scaleBy(x:1,y:-1)
 var top:[CGFloat]=[1,1,1],bottom:[CGFloat]=[0.91,0.93,1]
 if mode=="light" {
  gradient(ctx,[mix(theme,1,0.22),mix(theme,0,0.28)],CGPoint(x:240,y:0),CGPoint(x:784,y:1024))
 } else if mode=="dark" {
  gradient(ctx,[theme.map{0.038+$0*0.1},theme.map{0.025+$0*0.06}],CGPoint(x:240,y:0),CGPoint(x:784,y:1024))
  let c=name.contains("graphite") ? rgb("b6b6bd") : theme
  top=mix(c,1,0.23);bottom=c
 } else if mode=="tinted" {
  gradient(ctx,[[0.095,0.095,0.105],[0.055,0.055,0.062]],CGPoint(x:512,y:0),CGPoint(x:512,y:1024))
  let c=name.contains("graphite") ? rgb("c5c5cb") : mix(theme,1,0.48)
  top=mix(c,1,0.15);bottom=c
 } else {
  ctx.translateBy(x:512,y:504);ctx.scaleBy(x:0.88,y:0.88);ctx.translateBy(x:-512,y:-512)
 }
 if mode=="android" {ctx.addPath(path);ctx.setFillColor(color([1,1,1]));ctx.drawPath(using:.eoFill)}
 else {
  ctx.saveGState();ctx.setShadow(offset:CGSize(width:0,height:8),blur:18,color:color([0,0,0],0.19))
  ctx.addPath(path);ctx.setFillColor(color(bottom));ctx.drawPath(using:.eoFill);ctx.restoreGState()
  ctx.saveGState();ctx.addPath(path);ctx.clip(using:.evenOdd)
  gradient(ctx,[top,bottom],CGPoint(x:400,y:210),CGPoint(x:624,y:800));ctx.restoreGState()
 }
 let small=context(1024);small.interpolationQuality = .high
 small.draw(ctx.makeImage()!,in:CGRect(x:0,y:0,width:1024,height:1024));write(small.makeImage()!,name)
}
for (theme,hex) in themes {for mode in ["light","dark","tinted","android"] {render("vera-\(theme)-\(mode=="android" ? "android-foreground" : mode).png",rgb(hex),mode)}}
render("vera-android-monochrome.png",[1,1,1],"android")
