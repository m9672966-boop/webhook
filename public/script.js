document.getElementById('employeeForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = {
    email: document.getElementById('email').value.trim(),
    fullName: document.getElementById('fullName').value.trim(),
    role: document.getElementById('role').value // ✅ Было: === 'Дизайн-группа' ? 'design' : 'dev' — это было ошибкой!
  };

  console.log('Отправка данных:', formData);

  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = '<p>Обработка...</p>';
  resultDiv.className = '';

  try {
    const response = await fetch('/new-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok) {
      resultDiv.innerHTML = `<p>${data.message}</p>`;
      resultDiv.className = 'result success';
      document.getElementById('employeeForm').reset();
    } else {
      resultDiv.innerHTML = `<p>Ошибка: ${data.error}</p>`;
      resultDiv.className = 'result error';
    }
  } catch (error) {
    resultDiv.innerHTML = `<p>Ошибка соединения: ${error.message}</p>`;
    resultDiv.className = 'result error';
  }
});
