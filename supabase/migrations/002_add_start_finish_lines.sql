-- Add start and finish line positions to course templates
alter table course_templates add column start_line_lat1 double precision;
alter table course_templates add column start_line_lng1 double precision;
alter table course_templates add column start_line_lat2 double precision;
alter table course_templates add column start_line_lng2 double precision;
alter table course_templates add column finish_line_lat1 double precision;
alter table course_templates add column finish_line_lng1 double precision;
alter table course_templates add column finish_line_lat2 double precision;
alter table course_templates add column finish_line_lng2 double precision;
alter table course_templates add column finish_at_start boolean default true;
