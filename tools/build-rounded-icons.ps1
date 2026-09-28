Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$bitmap=[Drawing.Bitmap]::new(1024,1024)
$g=[Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.ScaleTransform(2,2)
function Gradient($rect,$a,$b){[Drawing.Drawing2D.LinearGradientBrush]::new($rect,[Drawing.ColorTranslator]::FromHtml($a),[Drawing.ColorTranslator]::FromHtml($b),[single]70)}
function RoundedRect($x,$y,$w,$h,$r,$a,$b){
  $p=[Drawing.Drawing2D.GraphicsPath]::new();$d=2*$r
  $p.AddArc($x,$y,$d,$d,180,90);$p.AddArc($x+$w-$d,$y,$d,$d,270,90)
  $p.AddArc($x+$w-$d,$y+$h-$d,$d,$d,0,90);$p.AddArc($x,$y+$h-$d,$d,$d,90,90);$p.CloseFigure()
  $brush=Gradient ([Drawing.RectangleF]::new($x,$y,$w,$h)) $a $b;$g.FillPath($brush,$p);$brush.Dispose();$p.Dispose()
}
$bg=Gradient ([Drawing.RectangleF]::new(0,0,512,512)) '#FFF49A' '#FFC000';$g.FillRectangle($bg,0,0,512,512);$bg.Dispose()
$svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="bg" x2=".4" y2="1"><stop stop-color="#FFF49A"/><stop offset="1" stop-color="#FFC000"/></linearGradient><linearGradient id="body" x2=".3" y2="1"><stop stop-color="#FF6571"/><stop offset=".5" stop-color="#F12D48"/><stop offset="1" stop-color="#DB1537"/></linearGradient><linearGradient id="stud" x2=".3" y2="1"><stop stop-color="#FFB6AA"/><stop offset=".5" stop-color="#FF6975"/><stop offset="1" stop-color="#F53754"/></linearGradient></defs><rect width="512" height="512" fill="url(#bg)"/><g transform="rotate(-12 256 256)"><rect x="117" y="139" width="288" height="288" rx="67" fill="#DBA51D"/><rect x="108" y="123" width="288" height="288" rx="62" fill="#AF1234"/><rect x="108" y="101" width="288" height="288" rx="62" fill="url(#body)"/><path d="M133 165Q133 120 180 120H302" fill="none" stroke="#FFADA6" stroke-width="5" stroke-linecap="round"/>'
$g.TranslateTransform(256,256);$g.RotateTransform(-12);$g.TranslateTransform(-256,-256)
RoundedRect 117 139 288 288 67 '#DBA51D' '#DBA51D'
RoundedRect 108 123 288 288 62 '#CA2341' '#AF1234'
RoundedRect 108 101 288 288 62 '#FF6571' '#DB1537'
$pen=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#FFADA6'),5);$pen.StartCap='Round';$pen.EndCap='Round';$g.DrawBezier($pen,133,165,133,120,155,120,180,120);$g.DrawLine($pen,180,120,302,120);$pen.Dispose()
foreach($center in @(@(194,184),@(310,184),@(194,300),@(310,300))){
  $x=$center[0]-42;$y=$center[1]-42
  $shadow=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#B9183C'));$g.FillEllipse($shadow,$x,$y+10,84,84);$shadow.Dispose()
  $brush=Gradient ([Drawing.RectangleF]::new($x,$y,84,84)) '#FFB6AA' '#F53754';$g.FillEllipse($brush,$x,$y,84,84);$brush.Dispose()
  $pen=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#FFD4C9'),5);$pen.StartCap='Round';$pen.EndCap='Round';$g.DrawArc($pen,$x+9,$y+9,66,66,205,95);$pen.Dispose()
  $svg+="<circle cx='$($center[0])' cy='$($center[1]+10)' r='42' fill='#B9183C'/><circle cx='$($center[0])' cy='$($center[1])' r='42' fill='url(#stud)'/><path d='M$($x+12) $($y+29) A33 33 0 0 1 $($x+57) $($y+13)' fill='none' stroke='#FFD4C9' stroke-width='5' stroke-linecap='round'/>"
}
$svg+='</g></svg>'
[IO.File]::WriteAllText((Join-Path $root 'favicon-square.svg'),$svg,[Text.UTF8Encoding]::new($false))
foreach($asset in @(@('apple-touch-icon-v3.png',180),@('favicon-square-180.png',180),@('favicon-square-32.png',32),@('app-icon-512.png',512))){
  $size=[int]$asset[1];$output=[Drawing.Bitmap]::new($size,$size);$canvas=[Drawing.Graphics]::FromImage($output)
  $canvas.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$canvas.DrawImage($bitmap,0,0,$size,$size)
  $output.Save((Join-Path $root $asset[0]),[Drawing.Imaging.ImageFormat]::Png);$canvas.Dispose();$output.Dispose()
}
$g.Dispose();$bitmap.Dispose()
