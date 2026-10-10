import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random
T=os.path.join(os.path.dirname(os.path.abspath(__file__)),'tex')+'/'
BI='/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf'
def F(s,p=BI): return ImageFont.truetype(p,s)
def chrome_text(img, xy, text, font, top=(255,255,255), bot=(255,170,40), stroke=(20,10,40), sw=8, shadow=(255,40,160), anchor='mm'):
    W,H=img.size
    mask=Image.new('L',img.size,0); ImageDraw.Draw(mask).text(xy,text,font=font,fill=255,anchor=anchor)
    bbox=mask.getbbox()
    sh=Image.new('L',img.size,0); ImageDraw.Draw(sh).text((xy[0]+sw*0.9,xy[1]+sw*0.9),text,font=font,fill=255,anchor=anchor,stroke_width=sw)
    img.paste(Image.new('RGB',img.size,shadow),(0,0),sh)
    st=Image.new('L',img.size,0); ImageDraw.Draw(st).text(xy,text,font=font,fill=255,anchor=anchor,stroke_width=sw)
    img.paste(Image.new('RGB',img.size,stroke),(0,0),st)
    grad=Image.new('RGB',img.size)
    g=ImageDraw.Draw(grad)
    y0,y1=bbox[1],bbox[3]
    for y in range(H):
        t=min(1,max(0,(y-y0)/max(1,(y1-y0))))
        if t<0.5: c=tuple(int(top[i]) for i in range(3))
        else:
            k=(t-0.5)/0.5; c=tuple(int(top[i]*(1-k)+bot[i]*k) for i in range(3))
        g.line([(0,y),(W,y)],fill=c)
    # horizon line through middle (90s chrome)
    img.paste(grad,(0,0),mask)
    hl=Image.new('L',img.size,0); hd=ImageDraw.Draw(hl); my=(y0+y1)//2; hd.rectangle([0,my-2,W,my+2],fill=160)
    hl=Image.composite(hl,Image.new('L',img.size,0),mask)
    img.paste(Image.new('RGB',img.size,(60,30,90)),(0,0),hl)

# 1. main hanging banner
b=Image.new('RGB',(2400,600),(14,18,60))
d=ImageDraw.Draw(b)
for i in range(0,2400,60): d.polygon([(i,600),(i+30,600),(i+330,0),(i+300,0)],fill=(18,24,78))
d.rectangle([0,0,2399,599],outline=(255,210,40),width=14); d.rectangle([22,22,2377,577],outline=(255,40,160),width=6)
chrome_text(b,(1200,250),'FIT FIGHTERS',F(250))
d.text((1200,470),'★ CHAMPIONSHIP BOXING ★  FIGHT NIGHT \'96',font=F(80),fill=(80,230,255),anchor='mm',stroke_width=4,stroke_fill=(10,10,30))
b.save(T+'banner_main.png')
# 2. side banners
for name,txt,sub,col in [('banner_l','VALDOSTA','GEORGIA',(140,10,20)),('banner_r','LIVE','PAY-PER-VIEW',(10,60,120))]:
    s=Image.new('RGB',(600,1200),col); d=ImageDraw.Draw(s)
    d.rectangle([0,0,599,1199],outline=(255,210,40),width=14)
    chrome_text(s,(300,420),txt,F(150 if len(txt)<6 else 92),sw=6)
    d.text((300,700),sub,font=F(70 if len(sub)<8 else 52),fill=(255,255,255),anchor='mm',stroke_width=3,stroke_fill=(0,0,0))
    d.text((300,950),'FF',font=F(260),fill=(255,210,40),anchor='mm',stroke_width=6,stroke_fill=(0,0,0))
    s.save(T+name+'.png')
# 3. canvas floor: off-white canvas w/ center logo + corner tint
c=Image.new('RGB',(2048,2048),(178,176,170)); d=ImageDraw.Draw(c)
rnd=random.Random(3)
for _ in range(9000):
    x,y=rnd.randrange(2048),rnd.randrange(2048); v=rnd.randrange(-14,10); d.point((x,y),fill=(196+v,192+v,180+v))
for _ in range(60):  # scuffs
    x,y=rnd.randrange(2048),rnd.randrange(2048); r=rnd.randrange(10,60)
    d.ellipse([x-r,y-r//3,x+r,y+r//3],fill=(176,170,158))
d.ellipse([474,474,1574,1574],fill=(20,30,95),outline=(255,210,40),width=24)
d.ellipse([530,530,1518,1518],outline=(255,40,160),width=10)
chrome_text(c,(1024,960),'FIT',F(330),sw=10)
chrome_text(c,(1024,1240),'FIGHTERS',F(165),sw=8)
c=c.filter(ImageFilter.GaussianBlur(0.8)); c.save(T+'canvas.png')
# 4. apron skirt
a=Image.new('RGB',(4096,256),(16,22,70)); d=ImageDraw.Draw(a)
for i,t in enumerate(['FIT FIGHTERS','SPECIFIC INTANGIBLES','FIT FIGHTERS','FIGHT NIGHT \'96']):
    d.text((512+i*1024,128),t,font=F(110),fill=(255,210,40),anchor='mm',stroke_width=4,stroke_fill=(0,0,0))
a.save(T+'apron.png')
print('ok')
