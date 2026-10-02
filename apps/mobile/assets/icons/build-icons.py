from pathlib import Path
import json, subprocess
ROOT = Path(__file__).resolve().parent
ICTOOL = "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
THEMES = {"indigo":"#4f46e5","blue":"#007aff","teal":"#0d9488","green":"#16a34a","orange":"#ea580c","pink":"#db2777","purple":"#7c3aed","graphite":"#3a3a3c"}
# One compound path: rounded bubble, then the counterform V.
PATH = "M 358 226 H 666 C 762 226 822 286 822 382 V 578 C 822 674 762 734 666 734 H 414 L 294 804 Q 272 817 276 791 L 287 720 C 230 700 202 651 202 578 V 382 C 202 286 262 226 358 226 Z M 354 401 Q 341 379 365 366 Q 389 353 403 376 L 512 544 L 621 376 Q 635 353 659 366 Q 683 379 670 401 L 548 591 Q 512 646 476 591 Z"
def rgb(h): return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
def color(c): return "extended-srgb:"+",".join(f"{x:.5f}" for x in (*c,1))
def hexcolor(c): return "#"+"".join(f"{round(x*255):02x}" for x in c)
def svg():
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><path fill="#ffffff" fill-rule="evenodd" d="{PATH}"/></svg>\n'
commands=[]
palette={}
for theme,h in THEMES.items():
    c=rgb(h); top=tuple(x+(1-x)*.22 for x in c); bottom=tuple(x*.72 for x in c)
    dark=tuple(.025+x*.06 for x in c); darktop=tuple(.038+x*.1 for x in c)
    # Graphite needs a silver glyph to keep its dark appearance readable.
    glyph=c if theme!="graphite" else rgb("#b6b6bd")
    bundle=ROOT/f"vera-{theme}.icon"; (bundle/"Assets").mkdir(parents=True, exist_ok=True)
    (bundle/"Assets"/"bubble-v.svg").write_text(svg())
    doc={
      "fill":{"linear-gradient":[color(top),color(bottom)]},
      "fill-specializations":[
        {"appearance":"dark","value":{"linear-gradient":[color(darktop),color(dark)]}},
        {"appearance":"tinted","value":{"solid":color(rgb("#171719"))}}
      ],
      "groups":[{
        "name":"Vera bubble",
        "layers":[{"image-name":"bubble-v.svg","name":"Bubble with V counterform","glass":True,
          "fill-specializations":[
            {"appearance":"dark","value":{"solid":color(glyph)}},
            {"appearance":"tinted","value":{"solid":color((1,1,1))}}
          ]}],
        "shadow":{"kind":"neutral","opacity":.22},
        "specular":True,
        "translucency":{"enabled":True,"value":.12}
      }],
      "supported-platforms":{"squares":"shared"}
    }
    (bundle/"icon.json").write_text(json.dumps(doc,indent=2)+"\n")
    palette[theme]={"base":h,"light_top":hexcolor(top),"light_bottom":hexcolor(bottom),"dark_top":hexcolor(darktop),"dark_bottom":hexcolor(dark),"dark_glyph":hexcolor(glyph)}
    for label,rendition in [("light","Default"),("dark","Dark"),("tinted","TintedDark")]:
        args=[ICTOOL,str(bundle),"--export-image","--output-file",str(ROOT/f"vera-{theme}-{label}.png"),"--platform","iOS","--rendition",rendition,"--width","1024","--height","1024","--scale","1"]
        if label=="tinted": args+=["--tint-color",str({"indigo":.665,"blue":.59,"teal":.485,"green":.38,"orange":.055,"pink":.93,"purple":.735,"graphite":0}[theme]),"--tint-strength","0" if theme=="graphite" else "0.8"]
        commands.append(args)
(ROOT/"palette.json").write_text(json.dumps(palette,indent=2)+"\n")
(ROOT/"render-commands.json").write_text(json.dumps(commands,indent=2)+"\n")
if __name__=="__main__" and "--documents-only" not in __import__("sys").argv:
    import sys
    for args in (commands[:3] if "--sample" in sys.argv else commands):
        print(Path(args[1]).name, args[args.index("--rendition")+1],flush=True)
        subprocess.run(args,check=True)
