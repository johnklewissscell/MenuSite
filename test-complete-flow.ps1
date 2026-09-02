Write-Host "Testing /product and /nutrition endpoints on live Render..." -ForegroundColor Cyan
Write-Host ""

$testUPCs = @('0030100215981', '0028400243063', '0016571940355', '0853004004952')

foreach ($upc in $testUPCs) {
  Write-Host "UPC: $upc" -ForegroundColor Yellow
  
  # Test /product endpoint
  try {
    $resp = Invoke-WebRequest -Uri "https://worthingtonnutritionsite.onrender.com/product?upc=$upc" -UseBasicParsing -TimeoutSec 10
    $json = ConvertFrom-Json $resp.Content
    if ($json.found) {
      Write-Host "  Product: $($json.product.product_name) ($($json.product.brand_name))" -ForegroundColor Green
      Write-Host "    Source: $($json.source)" -ForegroundColor Gray
    } else {
      Write-Host "  Product: NOT FOUND" -ForegroundColor Red
    }
  } catch {
    Write-Host "  Product Error: $($_.Exception.Message)" -ForegroundColor Red
  }
  
  # Test /nutrition endpoint
  try {
    $resp2 = Invoke-WebRequest -Uri "https://worthingtonnutritionsite.onrender.com/nutrition?upc=$upc" -UseBasicParsing -TimeoutSec 10
    $json2 = ConvertFrom-Json $resp2.Content
    if ($json2.found) {
      $cal = $json2.food.servings.serving[0].calories
      Write-Host "  Nutrition: FOUND ($cal calories)" -ForegroundColor Green
      Write-Host "    Source: $($json2.source)" -ForegroundColor Gray
    } else {
      Write-Host "  Nutrition: NOT FOUND" -ForegroundColor Red
    }
  } catch {
    Write-Host "  Nutrition Error: $($_.Exception.Message)" -ForegroundColor Red
  }
  
  Write-Host ""
  Start-Sleep -Milliseconds 1000
}
