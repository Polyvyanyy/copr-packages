Name:           youtubeUnblock
Version:		0.3.1
Release:		1%{?git_rel}%{?dist}
Summary:		Bypasses Googlevideo detection systems that relies on SNI
License:		GPL-3.0
Group:          Productivity

Url:			https://github.com/Waujito/youtubeUnblock
Source:			%{url}/archive/refs/tags/v%{version}.tar.gz
BuildRequires:	gcc-c++
BuildRequires:	autoconf
BuildRequires:	libtool
BuildRequires:	make
BuildRequires:	automake
BuildRequires:	pkg-config
BuildRequires:	systemd-rpm-macros
BuildRequires:	glibc-static

%description

Bypasses Googlevideo detection systems that relies on SNI.



%prep
%autosetup -n %{name}-%{version} -p1
sed -i 's|$(PREFIX)/bin/youtubeUnblock|/usr/bin/youtubeUnblock|' youtubeUnblock.service


%build
%make_build

%install
make install PREFIX=%{buildroot}/usr

%post
%systemd_post youtubeUnblock.service

%preun
%systemd_preun youtubeUnblock.service

%postun
%systemd_postun_with_restart youtubeUnblock.service

%files
%{_bindir}/%{name}
%{_unitdir}/%{name}.service

%changelog
* Mon Aug 19 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.3.1-1
- 0.3.1

* Tue Aug 13 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.1.0-6.gite6367c7
- e6367c72bd8db8e0e34fab155efa9f2af7f2674a commit

* Wed Aug 07 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.1.0-5.git477304a
- 477304ab53252c9bdd8911b97fa5f6187744a2e4 commit

* Fri Aug 02 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.1.0-4.git72a7c21
- 72a7c21b17144c65c4a2d232119a34f2c3e9826d commit

* Fri Aug 02 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.1.0-3.git10006d4
- 10006d464f4b5b72db827fc8e89cd1c9e2947f84 commit

* Thu Aug 01 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.1.0-2.git13e78bd
- add sed for .service file

* Thu Aug 01 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.1.0-1.git13e78bd
- init exp build
