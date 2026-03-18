# Manual de Usuario - Rol Staff

## Objetivo del rol
El rol `staff` esta pensado para trabajar la agenda del dia y registrar lo realizado en turnos que ya estan en curso.
Su foco es operativo, no administrativo.

## Que puede ver y usar
Con este rol solo se habilita la seccion **Turnos** del dashboard.
Dentro de Turnos, se muestra el panel de staff con:

- Lista en cards de los turnos asignados para **el dia actual**.
- Vista reducida con servicio y horario.
- Turnos `en_curso` con acceso a modificacion.
- Carga de servicios agregados.
- Carga de productos vendidos.
- Carga y visualizacion de foto de trabajo.
- Si la agenda del dia esta por debajo del 50% de la capacidad estimada (1 servicio por hora dentro del horario configurado), aparecen hasta 2 cards de **Turno ofrecido** dentro de su horario laboral.

## Que NO puede hacer
El rol `staff` no puede acceder a:

- Configuracion.
- Reportes.
- Facturas.
- Finanzas.
- Alta/edicion de clientes, servicios, personal, productos o insumos desde otras secciones.

## Flujo diario recomendado
1. Ingresar al sistema con usuario y clave.
2. Ir a `Dashboard > Turnos`.
3. Revisar la agenda del dia.
4. Cuando un turno este `en_curso`, abrirlo con **Modificar**.
5. Completar lo que se realizo:
   - Servicio final.
   - Servicios agregados (si hubo).
   - Productos vendidos (si hubo).
   - Foto del trabajo (opcional pero recomendado).
6. Guardar cambios.
7. Verificar que el turno quede actualizado para recepcion/caja.

## Uso paso a paso del editor de turno
### 1) Servicio final
- En **Servicio realizado**, elegir el servicio efectivamente ejecutado.
- Si fue igual al original, dejar el mismo.

### 2) Servicios agregados
- Usar **Agregar servicio** para sumar extras realizados.
- Cargar cantidad mayor a 0 en cada item.
- Se puede eliminar un item con el boton de eliminar.

### 3) Productos vendidos
- Usar **Agregar producto** para asociar productos usados o vendidos.
- Solo aparecen productos con stock.
- Cargar cantidad valida (mayor a 0 y respetando stock).
- Se puede eliminar un item con el boton de eliminar.

### 4) Foto del trabajo
- Click en **Subir foto del trabajo**.
- Formatos validos: imagen (JPG/PNG/WEBP).
- Tamano maximo: 5 MB.
- Si ya hay foto, se puede **Ver** o **Quitar foto**.

### 5) Guardado
- Click en **Guardar**.
- Si faltan cantidades obligatorias, el sistema marca el error y no guarda hasta corregir.

## Buenas practicas
- Registrar cambios en el momento, no al final del dia.
- Verificar cantidades antes de guardar.
- Si hubo cambio fuerte de servicio, dejarlo actualizado para que el cobro/factura sea correcto.
- Cargar foto cuando aporte evidencia de trabajo terminado.

## Problemas comunes y solucion
### No veo turnos
- El panel staff solo muestra lo asignado para **hoy**.
- No se muestran dias pasados ni dias futuros.
- Si hoy no hay nada asignado, el panel queda vacio.

### No puedo guardar
- Revisar que todas las cantidades de servicios/productos agregados sean mayores a 0.
- Revisar conexion de red e intentar nuevamente.

### No puedo subir foto
- Confirmar que el archivo sea imagen.
- Confirmar que pese menos de 5 MB.
