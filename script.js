document.addEventListener('DOMContentLoaded', () => {
    const playerForm = document.getElementById('playerForm');
    const toast = document.getElementById('toast');

    const playerTypeSelect = document.getElementById('playerType');
    const authSection = document.getElementById('authorizationSection');
    const socioInputs = [document.getElementById('socioName'), document.getElementById('socioDni'), document.getElementById('socioPhone')];
    const playerInputs = [document.getElementById('fullName'), document.getElementById('dni')];

    // Manejar visibilidad de sección de autorización
    playerTypeSelect.addEventListener('change', () => {
        if (playerTypeSelect.value === 'conyuge' || playerTypeSelect.value === 'adherente') {
            authSection.classList.remove('hidden-section');
            socioInputs.forEach(input => input.required = true);
            document.getElementById('dniSocioFile').required = true;
        } else {
            authSection.classList.add('hidden-section');
            socioInputs.forEach(input => input.required = false);
            document.getElementById('dniSocioFile').required = false;
        }
    });

    // Actualización dinámica del texto de autorización
    const updatePlaceholder = (inputId, placeholderId) => {
        const input = document.getElementById(inputId);
        const placeholder = document.getElementById(placeholderId);
        input.addEventListener('input', () => {
            placeholder.textContent = input.value || '__________';
        });
    };

    updatePlaceholder('socioName', 'p_socio_name');
    updatePlaceholder('socioDni', 'p_socio_dni');
    updatePlaceholder('socioPhone', 'p_socio_phone');
    updatePlaceholder('fullName', 'p_player_name');
    updatePlaceholder('dni', 'p_player_dni');

    playerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(playerForm);

        const submitBtn = playerForm.querySelector('button');
        const originalContent = submitBtn.innerHTML;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Procesando inscripción...</span>';

        try {
            // 1. Generar PDF local (basado en los datos del formulario)
            const dataForPDF = Object.fromEntries(formData.entries());
            generatePDF(dataForPDF);

            // 2. Enviar datos al servidor
            const response = await fetch('/api/inscripcion', {
                method: 'POST',
                // No establecemos Content-Type, fetch lo hará automáticamente para FormData
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showToast('✅ ¡Inscripción exitosa! Correo enviado y PDF descargado.');
            } else {
                showToast('⚠️ Error: ' + (result.message || 'No se pudo procesar'));
                console.error('Error del servidor:', result);
            }

            // Resetear formulario después de un tiempo
            setTimeout(() => {
                playerForm.reset();
                authSection.classList.add('hidden-section');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalContent;
                document.querySelectorAll('.placeholder-field').forEach(p => p.textContent = '__________');
            }, 3000);

        } catch (error) {
            showToast('❌ Error de conexión. ¿Está el servidor corriendo?');
            console.error('Error completo:', error);
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalContent;
        }
    });

    function generatePDF(data) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Estilo del PDF
        doc.setFillColor(30, 41, 59); // Color oscuro AFEMEC
        doc.rect(0, 0, 210, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text("AFEMEC - COMPROBANTE DE INSCRIPCIÓN", 20, 25);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("DATOS DEL JUGADOR", 20, 55);
        doc.line(20, 57, 190, 57);

        doc.setFont("helvetica", "normal");
        let y = 65;
        const fields = [
            ["Nombre:", data.fullName],
            ["CI:", data.dni],
            ["Teléfono:", data.phone],
            ["Email:", data.email],
            ["Tipo:", data.playerType.toUpperCase()],
            ["Equipo:", data.teamName.replace(/_/g, ' ').toUpperCase()],
            ["Categoría:", data.category.toUpperCase()],
            ["Camiseta:", data.jerseyNumber || "N/A"]
        ];

        fields.forEach(([label, value]) => {
            doc.setFont("helvetica", "bold");
            doc.text(label, 20, y);
            doc.setFont("helvetica", "normal");
            doc.text(String(value), 60, y);
            y += 10;
        });

        if (data.playerType !== 'socio') {
            y += 10;
            doc.setFont("helvetica", "bold");
            doc.text("AUTORIZACIÓN DE SOCIO", 20, y);
            doc.line(20, y + 2, 190, y + 2);
            y += 10;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            const authText = `Yo ${data.socioName}, Socio/a con CI ${data.socioDni}, autorizo expresamente a ${data.fullName} con CI ${data.dni} a participar en el torneo AFEMEC 2026.`;
            const splitText = doc.splitTextToSize(authText, 170);
            doc.text(splitText, 20, y);
        }

        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("Este documento es un comprobante oficial de la Lista de Buena Fe.", 20, 280);
        doc.text("Fecha de generación: " + new Date().toLocaleString(), 20, 285);

        doc.save(`Inscripcion_${data.fullName.replace(/\s+/g, '_')}.pdf`);
    }

    function sendWhatsApp(data) {
        const teamName = data.teamName.replace(/_/g, ' ').toUpperCase();
        const categoria = data.category.toUpperCase();

        // Limpiar el número de teléfono para WhatsApp (quitar espacios, guiones, etc.)
        let playerPhone = data.phone.replace(/\D/g, '');
        // Si no tiene código de país, podrías agregar el de Paraguay (+595) por defecto
        if (playerPhone.length === 9 && playerPhone.startsWith('0')) {
            playerPhone = '595' + playerPhone.substring(1);
        } else if (playerPhone.length === 9) {
            playerPhone = '595' + playerPhone;
        }

        const message = `*CONFIRMACIÓN DE INSCRIPCIÓN - AFEMEC 2026*%0A%0A` +
            `Hola *${data.fullName}*! Te informamos que tu inscripción a la *Lista de Buena Fe* ha sido procesada con éxito.%0A%0A` +
            `*DETALLES:*%0A` +
            `*Equipo:* ${teamName}%0A` +
            `*Categoría:* ${categoria}%0A` +
            `*CI:* ${data.dni}%0A%0A` +
            `¡Bienvenido al torneo! Ya puedes descargar tu comprobante adjunto.`;

        // Abrir WhatsApp dirigido al número del jugador
        const whatsappUrl = `https://wa.me/${playerPhone}?text=${message}`;
        window.open(whatsappUrl, '_blank');
    }

    function sendEmailNotification(data) {
        const teamName = data.teamName.replace(/_/g, ' ').toUpperCase();
        const subject = `Confirmación de Inscripción - ${data.fullName} - AFEMEC`;
        const body = `Hola ${data.fullName},\n\n` +
            `Te confirmamos que has sido inscrito exitosamente en la Lista de Buena Fe del Torneo AFEMEC 2026.\n\n` +
            `EQUIPO: ${teamName}\n` +
            `CATEGORÍA: ${data.category.toUpperCase()}\n` +
            `CI: ${data.dni}\n\n` +
            `Atentamente,\n` +
            `Comité Organizador AFEMEC`;

        const mailtoUrl = `mailto:${data.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Efecto sutil al mover el mouse en los campos
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.style.transform = 'translateY(-2px)';
            input.parentElement.style.transition = 'transform 0.3s ease';
        });

        input.addEventListener('blur', () => {
            input.parentElement.style.transform = 'translateY(0)';
        });
    });
});
