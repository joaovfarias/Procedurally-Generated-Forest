function updateTreeAmountValue() {
    const slider = document.getElementById('treeAmountSlider');
    const sliderValue = slider.value;

    return parseInt(sliderValue);
  }

  function updateForestDensityValue() {
    const slider = document.getElementById('objectCountSlider');
    const sliderValue = slider.value;

    return sliderValue;
  }

  function updateForestSizeValue() {
    const slider = document.getElementById('forestSizeSlider');
    const sliderValue = slider.value;

    return sliderValue;
  }

  function updateTreeScaleValue() {
    const slider = document.getElementById('treeScaleSlider');
    const sliderValue = slider.value;

    return parseFloat(sliderValue);
  }

  function updateGrassAmountValue() {
    const slider = document.getElementById('grassAmountSlider');
    const sliderValue = slider.value;

    return parseInt(sliderValue);
  }