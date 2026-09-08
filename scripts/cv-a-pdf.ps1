# Regenera los PDF del CV a partir de los .docx originales.
# Requiere Microsoft Word instalado. Uso, parado en la raiz del proyecto:
#
#   powershell -File scripts/cv-a-pdf.ps1
#
# Los .docx viven una carpeta mas arriba (Documentos\Santiago) y no se tocan:
# se abren en modo solo lectura.

$origen = Split-Path -Parent $PSScriptRoot      # ...\Pagina propia
$origen = Split-Path -Parent $origen            # ...\Santiago
$destino = Join-Path (Split-Path -Parent $PSScriptRoot) "cv"

if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }

# El nombre del archivo en espanol lleva enie: se compone por codigo para no
# depender de como Windows PowerShell interprete el encoding de este archivo.
$pares = @(
  @{ doc = "Santiago Massieri CV Espa" + [char]0x00F1 + "ol.docx"; pdf = "Santiago-Massieri-CV-ES.pdf" },
  @{ doc = "Santiago Massieri CV English.docx";                    pdf = "Santiago-Massieri-CV-EN.pdf" }
)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

try {
  foreach ($p in $pares) {
    $rutaDoc = [string](Join-Path $origen $p.doc)
    $rutaPdf = [string](Join-Path $destino $p.pdf)

    if (-not (Test-Path $rutaDoc)) {
      Write-Output "FALTA: $rutaDoc"
      continue
    }

    $doc = $word.Documents.Open($rutaDoc, $false, $true)   # ReadOnly
    $doc.ExportAsFixedFormat($rutaPdf, 17)                 # 17 = wdExportFormatPDF
    $doc.Close($false)

    $info = Get-Item $rutaPdf
    Write-Output "OK $($p.pdf)  $([math]::Round($info.Length / 1KB)) KB"
  }
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
