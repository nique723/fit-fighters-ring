import sys,glob,os
from PIL import Image, ImageDraw
d=sys.argv[1]; files=sorted(glob.glob(d+'/*.png')); n=len(files); cols=6; tw=240; th=252
s=Image.new('RGBA',(cols*tw,((n+cols-1)//cols)*th),(80,80,80,255)); dr=ImageDraw.Draw(s)
for i,f in enumerate(files):
    im=Image.open(f).resize((tw,th)); x=(i%cols)*tw; y=(i//cols)*th; s.paste(im,(x,y),im); dr.text((x+4,y+4),os.path.basename(f),fill=(255,255,0,255))
    dr.line([(x+int(tw*0.4),y),(x+int(tw*0.4),y+th)],fill=(255,0,0,120))
s.save(sys.argv[2])
